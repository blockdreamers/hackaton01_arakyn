// Agent Catalog lane: Claude with one client tool, search_offers, answered from the connected DB.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './client.ts';
import { RUN_CAP_USD, inputTokensOf, record } from './budget.ts';
import { BUYER_SYSTEM, CATALOG_TOOL_HINT, type Spec } from './prompts.ts';
import {
	SEARCH_OFFERS_SCHEMA,
	searchOffers,
	verifyRows,
	type SearchInput,
	type SearchOutput
} from './db-search.ts';
import type { Emit } from './events.ts';
import { payCallFee } from '#lib/server/x402.ts';

const CALL_FEE_USDC = 0.02;

// x402.ts reads wallet keys from process.env; `vite dev` doesn't put .env there (Bun does in
// production), so load it once without overriding anything already set.
function ensureWalletEnv() {
	if (process.env.AGENT_WALLET_PRIVATE_KEY) return;
	try {
		process.loadEnvFile('.env');
	} catch {
		// no .env: payCallFee reports the missing key
	}
}

const MODEL = 'claude-opus-5-5';

const TOOL: Anthropic.Tool = {
	name: 'search_offers',
	description:
		'Search the Agent Catalog product index (scraped shop listings, mostly Korean names, prices in KRW). Returns up to 10 active listings sorted by price ascending: id, name, price, currency, site, url, categories, last seen date, plus the total match count.',
	input_schema: SEARCH_OFFERS_SCHEMA as unknown as Anthropic.Tool.InputSchema
};

export async function runCatalogLane(question: string, spec: Spec, emit: Emit) {
	const t0 = performance.now();
	const t = () => (performance.now() - t0) / 1000;
	const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
	let input = 0,
		output = 0,
		cost = 0,
		calls = 0;
	let last: SearchOutput | null = null;
	let answer = '';

	for (let turn = 0; turn < 5; turn++) {
		const res = await anthropic().messages.create({
			model: MODEL,
			max_tokens: 4000,
			output_config: { effort: 'low' },
			system: `${BUYER_SYSTEM}\n\n${CATALOG_TOOL_HINT}`,
			tools: [TOOL],
			messages
		});
		cost += await record('race catalog lane', MODEL, res.usage);
		const inTok = inputTokensOf(res.usage);
		input += inTok;
		output += res.usage.output_tokens;
		emit({
			type: 'step',
			lane: 'catalog',
			kind: 'usage',
			label: `model turn ${turn + 1}`,
			inputTokens: inTok,
			outputTokens: res.usage.output_tokens,
			t: t()
		});
		messages.push({ role: 'assistant', content: res.content });

		const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
		if (res.stop_reason !== 'tool_use' || uses.length === 0) {
			answer = res.content
				.filter((b) => b.type === 'text')
				.map((b) => (b as Anthropic.TextBlock).text)
				.join('\n');
			break;
		}
		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const u of uses) {
			calls++;
			const args = (u.input ?? {}) as SearchInput;
			try {
				last = await searchOffers({ ...args, terms: Array.isArray(args.terms) ? args.terms : [] });
				emit({
					type: 'step',
					lane: 'catalog',
					kind: 'tool',
					label: `search_offers [${(args.terms ?? []).join(', ')}] → ${last.rows.length} of ${last.total}`,
					inputTokens: 0,
					outputTokens: 0,
					t: t()
				});
				results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(last) });
			} catch (e) {
				results.push({
					type: 'tool_result',
					tool_use_id: u.id,
					content: `search failed: ${e instanceof Error ? e.message : e}`,
					is_error: true
				});
			}
		}
		messages.push({ role: 'user', content: results });
		if (cost > RUN_CAP_USD) {
			answer = 'Stopped: the per-run cost cap was reached.';
			break;
		}
	}

	let verify: 'pass' | 'fail' | 'skipped' = 'skipped';
	let payment: { tx: string; url: string; ok: boolean } | null = null;
	if (last) {
		const v = verifyRows(spec, last);
		verify = v.pass ? 'pass' : 'fail';
		const failed = v.checks.filter((x) => !x.ok).map((x) => `#${x.row} ${x.check}`);
		emit({
			type: 'step',
			lane: 'catalog',
			kind: 'verify',
			label: v.pass
				? `verify: ${v.checks.length} checks pass`
				: v.checks.length === 0
					? 'verify: nothing to verify, nothing paid'
					: `verify failed: ${failed.join(', ')}`,
			inputTokens: 0,
			outputTokens: 0,
			t: t(),
			tone: v.pass ? 'ok' : 'bad'
		});
		// Real Base Sepolia USDC payment, only after verification passes, once per search.
		if (v.pass) {
			const step = (label: string, tone: 'pay' | 'bad', url?: string) =>
				emit({
					type: 'step',
					lane: 'catalog',
					kind: 'pay',
					label,
					inputTokens: 0,
					outputTokens: 0,
					t: t(),
					tone,
					url
				});
			step(`x402 · signing ${CALL_FEE_USDC} USDC on Base Sepolia…`, 'pay');
			try {
				ensureWalletEnv();
				const tx = await payCallFee(CALL_FEE_USDC);
				payment = { tx: tx.hash, url: tx.url, ok: tx.ok };
				step(
					tx.ok
						? `paid ${CALL_FEE_USDC} USDC · tx ${tx.hash.slice(0, 10)}… · data hash ${last.data_hash}`
						: `payment tx reverted · ${tx.hash.slice(0, 10)}…`,
					tx.ok ? 'pay' : 'bad',
					tx.url
				);
			} catch (e) {
				step(`payment failed: ${e instanceof Error ? e.message.slice(0, 120) : e}`, 'bad');
			}
		}
	}
	return {
		answer,
		results: last?.rows.slice(0, 3) ?? [],
		input,
		output,
		cost,
		calls,
		verify,
		t: t(),
		dataHash: last?.data_hash ?? null,
		payment
	};
}
