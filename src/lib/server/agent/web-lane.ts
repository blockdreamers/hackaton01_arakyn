// Web lane: the same buyer agent with Anthropic's server-side web search and web fetch.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './client.ts';
import { RUN_CAP_USD, inputTokensOf, record } from './budget.ts';
import { BUYER_SYSTEM, WEB_TOOL_HINT } from './prompts.ts';
import type { Emit } from './events.ts';

const MODEL = 'claude-opus-5-5';
// No domain filter: the web agent searches the open web like an ordinary agent would.
// (taobao.com is rejected by Anthropic's web tools if listed in allowed_domains.)

const TOOLS: Anthropic.ToolUnion[] = [
	{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
	{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 }
];

function describe(b: Anthropic.ServerToolUseBlock) {
	const i = (b.input ?? {}) as { query?: string; url?: string };
	if (b.name === 'web_search') return `web_search "${i.query ?? ''}"`;
	if (b.name === 'web_fetch') return `web_fetch ${i.url ?? JSON.stringify(b.input).slice(0, 120)}`;
	// web tools with dynamic filtering run code server-side to search and filter results
	return b.name === 'code_execution' ? 'code_execution (filtering search results)' : b.name;
}

export async function runWebLane(question: string, emit: Emit) {
	const t0 = performance.now();
	const t = () => (performance.now() - t0) / 1000;
	const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
	let input = 0,
		output = 0,
		cost = 0,
		calls = 0;
	let answer = '';
	let aborted: string | undefined;

	// pause_turn: the server paused a long tool turn; resend to let it continue.
	for (let turn = 0; turn < 5; turn++) {
		const stream = anthropic().messages.stream({
			model: MODEL,
			max_tokens: 16000,
			output_config: { effort: 'low' },
			system: `${BUYER_SYSTEM}\n\n${WEB_TOOL_HINT}`,
			tools: TOOLS,
			messages
		});
		stream.on('contentBlock', (b) => {
			if (b.type === 'server_tool_use') {
				calls++;
				emit({
					type: 'step',
					lane: 'web',
					kind: 'tool',
					label: describe(b),
					inputTokens: 0,
					outputTokens: 0,
					t: t()
				});
			} else if (b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result') {
				// errors come back as a result block with an error object, not as an exception
				const c = b.content as unknown as { type?: string; error_code?: string } | unknown[];
				if (!Array.isArray(c) && c?.error_code)
					emit({
						type: 'step',
						lane: 'web',
						kind: 'tool',
						label: `${b.type === 'web_search_tool_result' ? 'search' : 'fetch'} failed: ${c.error_code}`,
						inputTokens: 0,
						outputTokens: 0,
						t: t(),
						tone: 'bad'
					});
				else if (Array.isArray(c))
					emit({
						type: 'step',
						lane: 'web',
						kind: 'tool',
						label: `search returned ${c.length} results`,
						inputTokens: 0,
						outputTokens: 0,
						t: t()
					});
				else if (b.type === 'web_fetch_tool_result')
					emit({
						type: 'step',
						lane: 'web',
						kind: 'tool',
						label: 'page fetched',
						inputTokens: 0,
						outputTokens: 0,
						t: t()
					});
			}
		});
		const res = await stream.finalMessage();
		const c = await record('race web lane', MODEL, res.usage);
		cost += c;
		const inTok = inputTokensOf(res.usage);
		input += inTok;
		output += res.usage.output_tokens;
		emit({
			type: 'step',
			lane: 'web',
			kind: 'usage',
			label: `model turn ${turn + 1} · ${res.usage.server_tool_use?.web_search_requests ?? 0} searches, ${res.usage.server_tool_use?.web_fetch_requests ?? 0} fetches`,
			inputTokens: inTok,
			outputTokens: res.usage.output_tokens,
			t: t()
		});
		// the answer is the text after the last tool block; earlier text is progress chatter
		const lastTool = res.content.findLastIndex((b) => b.type !== 'text');
		answer = res.content
			.slice(lastTool + 1)
			.filter((b) => b.type === 'text')
			.map((b) => (b as Anthropic.TextBlock).text)
			.join('');
		if (res.stop_reason !== 'pause_turn') break;
		if (cost > RUN_CAP_USD) {
			aborted = `cost cap $${RUN_CAP_USD} reached`;
			break;
		}
		messages.push({ role: 'assistant', content: res.content });
	}
	return { answer, input, output, cost, calls, t: t(), aborted };
}
