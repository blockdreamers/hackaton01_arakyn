// Every prompt and schema the agent search uses lives here so it can be tuned in one place.
import type { Spec } from '#lib/demo/spec.ts';

export type { Spec };

/** Spec extraction: free text from a buyer → normalized search spec. */
export const SPEC_SYSTEM = `You turn a buyer's free-text request for a part or component into a search spec for the Agent Catalog index.

The index holds product listings scraped from parts and education-supply shops. Most listings are Korean (names like "네오디움자석(ND자석 원형/구형/사각)", "AA건전지홀더(싱글/더블/3구)", "130전동모터(저속/고속)") priced in KRW; English listings (Amazon) are being added.

Produce:
- category: a short English name for the kind of product (e.g. "magnet", "battery holder", "LED", "DC motor", "socket cap screw").
- search_terms_ko: 2-4 Korean keywords a Korean seller would put in the product name, including common spacing/spelling variants (e.g. "네오디움자석", "네오디움 자석", "ND자석"). Keep each term short so substring search matches.
- search_terms_en: 1-3 English keywords for the same thing.
- must_include: 1-2 short words (usually Korean) that every relevant product name must contain, to filter out accessories and unrelated items. Empty if unsure.
- attributes: spec values the buyer stated or clearly implied (size, color, voltage, thread, length, count of slots...), as {field, value} strings with units normalized (inches to mm, "pcs"/"개"/"个" are quantity, not attributes).
- max_unit_price and currency: only if the buyer gave a price limit; "원" means KRW.
- qty: requested quantity, or null.
- ship_to: ISO country code; Korean requests with no destination default to "KR".
- ambiguities: short questions about anything that matters for picking the right part and was not stated (e.g. size, color, voltage, brand). Never invent values to avoid asking.
- summary: one short English line restating the request in normalized form.`;

const nullable = (type: string) => ({ type: [type, 'null'] });

export const SPEC_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: [
		'category',
		'search_terms_ko',
		'search_terms_en',
		'must_include',
		'attributes',
		'max_unit_price',
		'currency',
		'qty',
		'ship_to',
		'ambiguities',
		'summary'
	],
	properties: {
		category: { type: 'string' },
		search_terms_ko: { type: 'array', items: { type: 'string' } },
		search_terms_en: { type: 'array', items: { type: 'string' } },
		must_include: { type: 'array', items: { type: 'string' } },
		attributes: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['field', 'value'],
				properties: { field: { type: 'string' }, value: { type: 'string' } }
			}
		},
		max_unit_price: nullable('number'),
		currency: nullable('string'),
		qty: nullable('integer'),
		ship_to: nullable('string'),
		ambiguities: { type: 'array', items: { type: 'string' } },
		summary: { type: 'string' }
	}
} as const;

export const parseSpecOutput = (json: string) => JSON.parse(json) as Spec;

/**
 * Both race agents get this same system prompt and the same question; only their tools differ,
 * so the token difference comes from the tools.
 */
export const BUYER_SYSTEM = `You are a procurement agent for a company that buys parts and supplies. Find where to buy the requested item.
Answer with the 3 cheapest matching offers per unit, each with product name, seller, unit price with currency, and a link.
Only include offers that match the request. Be concise: a short table and one line on anything you could not confirm. Answer in the language of the request.`;

export const CATALOG_TOOL_HINT = `Use the search_offers tool. It searches the Agent Catalog index of product listings (mostly Korean names, prices in KRW). Search with Korean keywords first; try another variant if the first search finds nothing.`;

export const WEB_TOOL_HINT = `Use web search and web fetch to find and confirm offers on online shops.`;

/** The question both agents receive, built from the buyer's words and the extracted spec. */
export function buyerQuestion(query: string, spec: Spec) {
	return `Request: ${query}\nNormalized spec: ${spec.summary}\nKeywords: ${[...spec.search_terms_ko, ...spec.search_terms_en].join(', ')}`;
}
