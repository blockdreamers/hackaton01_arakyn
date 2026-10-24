import { anthropic } from './client.ts';
import { record, inputTokensOf } from './budget.ts';
import { SPEC_SCHEMA, SPEC_SYSTEM, parseSpecOutput } from './prompts.ts';

const MODEL = 'claude-haiku-5-5';

/** Free-text request → normalized spec (structured output, so the JSON always parses). */
export async function extractSpec(query: string) {
	const res = await anthropic().messages.create({
		model: MODEL,
		max_tokens: 2000,
		output_config: { effort: 'low', format: { type: 'json_schema', schema: SPEC_SCHEMA } },
		system: SPEC_SYSTEM,
		messages: [{ role: 'user', content: query }]
	});
	const cost = await record('spec extraction', MODEL, res.usage);
	if (res.stop_reason === 'refusal') throw new Error('The request was declined by the model.');
	const text = res.content.find((b) => b.type === 'text');
	if (!text || text.type !== 'text') throw new Error('No spec returned');
	const spec = parseSpecOutput(text.text);
	return {
		spec,
		usage: {
			inputTokens: inputTokensOf(res.usage),
			outputTokens: res.usage.output_tokens,
			costUsd: cost
		}
	};
}
