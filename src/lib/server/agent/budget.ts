// Spend tracking for the hackathon API key: every call is appended to usage-log.csv (gitignored)
// with a running total, and runs are refused before the $500 credit gets close.
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'usage-log.csv');

/** USD per million tokens [input, output]. */
const PRICES: Record<string, [number, number]> = {
	'claude-opus-5-5': [4, 20],
	'claude-haiku-5-5': [0.1, 0.5]
};
/** $10 per 1,000 web searches. */
const WEB_SEARCH_USD = 0.01;

export const REFUSE_AT_USD = 450;
export const RUN_CAP_USD = 3;

export interface Usage {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens?: number | null;
	cache_read_input_tokens?: number | null;
	server_tool_use?: { web_search_requests?: number } | null;
}

export function costOf(model: string, u: Usage) {
	const [pin, pout] = PRICES[model] ?? PRICES['claude-opus-5-5'];
	const input =
		u.input_tokens +
		(u.cache_creation_input_tokens ?? 0) * 1.25 +
		(u.cache_read_input_tokens ?? 0) * 0.1;
	const searches = u.server_tool_use?.web_search_requests ?? 0;
	return (input * pin + u.output_tokens * pout) / 1e6 + searches * WEB_SEARCH_USD;
}

/** All input tokens the model read on this call, cached or not. */
export const inputTokensOf = (u: Usage) =>
	u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

let cumulative: number | null = null;
let chain = Promise.resolve();

export async function spentUsd() {
	if (cumulative !== null) return cumulative;
	try {
		const lines = (await readFile(FILE, 'utf8')).trim().split('\n');
		cumulative = Number(lines[lines.length - 1].split(',').pop()) || 0;
	} catch {
		cumulative = 0;
	}
	return cumulative;
}

export async function assertBudget() {
	const spent = await spentUsd();
	if (spent >= REFUSE_AT_USD)
		throw new Error(`API budget guard: $${spent.toFixed(2)} spent, runs stop at $${REFUSE_AT_USD}`);
}

/** Log one API call; returns its cost. */
export async function record(purpose: string, model: string, u: Usage) {
	const cost = costOf(model, u);
	const before = await spentUsd();
	cumulative = before + cost;
	const line = [
		new Date().toISOString().slice(0, 10),
		purpose.replace(/,/g, ' '),
		model,
		inputTokensOf(u),
		u.output_tokens,
		cost.toFixed(4),
		cumulative.toFixed(4)
	].join(',');
	chain = chain.then(() => appendFile(FILE, line + '\n'));
	await chain;
	return cost;
}
