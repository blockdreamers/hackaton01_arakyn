// search_offers for the catalog agent: read-only keyword search over the connected products table.
import { and, asc, eq, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, sites } from '#lib/server/db/schema.ts';
import { fnv } from '#lib/demo/catalog.ts';
import type { Spec } from './prompts.ts';

export interface SearchInput {
	terms: string[];
	must_include?: string[];
	max_price?: number | null;
	limit?: number;
}

export const SEARCH_OFFERS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		terms: {
			type: 'array',
			items: { type: 'string' },
			description:
				'Keywords; a product matches if its name or category contains any of them. Use short Korean terms first.'
		},
		must_include: {
			type: 'array',
			items: { type: 'string' },
			description: 'Words every product name must contain.'
		},
		max_price: { type: 'number', description: 'Maximum unit price in the listing currency.' },
		limit: { type: 'integer', description: 'Max rows, default 10.' }
	},
	required: ['terms']
} as const;

const like = (t: string) => `%${t.replace(/[%_\\]/g, (c) => '\\' + c)}%`;

export async function searchOffers(input: SearchInput) {
	const terms = input.terms
		.map((t) => t.trim())
		.filter(Boolean)
		.slice(0, 8);
	if (terms.length === 0) return { rows: [], total: 0, data_hash: '0x' + fnv('') };
	const anyTerm = or(
		...terms.flatMap((t) => [
			ilike(products.name, like(t)),
			sql`array_to_string(${products.categories}, ' ') ilike ${like(t)}`
		])
	);
	const where: SQL[] = [eq(products.active, true), anyTerm!];
	for (const w of input.must_include ?? [])
		if (w.trim()) where.push(ilike(products.name, like(w.trim())));
	if (input.max_price != null) where.push(lte(products.price, input.max_price));

	const limit = Math.min(Math.max(input.limit ?? 10, 1), 10);
	const rows = await db
		.select({
			id: products.id,
			name: products.name,
			price: products.price,
			currency: sites.currency,
			site: sites.code,
			url: products.url,
			categories: products.categories,
			last_seen_at: products.lastSeenAt
		})
		.from(products)
		.innerJoin(sites, eq(products.siteId, sites.id))
		.where(and(...where))
		.orderBy(sql`${products.price} asc nulls last`, asc(products.id))
		.limit(limit);
	const [{ total }] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(products)
		.where(and(...where));

	const compact = rows.map((r) => ({
		id: r.id,
		name: r.name,
		price: r.price,
		currency: r.currency,
		site: r.site,
		url: r.url,
		categories: r.categories,
		seen: r.last_seen_at.toISOString().slice(0, 10)
	}));
	return {
		rows: compact,
		total,
		data_hash: '0x' + fnv(compact.map((r) => `${r.id}:${r.price}`).join('|'))
	};
}

export type SearchOutput = Awaited<ReturnType<typeof searchOffers>>;

/** Code-rule check of delivered rows against the request (no LLM, no tokens). */
export function verifyRows(spec: Spec, out: SearchOutput) {
	const top = out.rows.slice(0, 3);
	const checks = top.flatMap((r) => [
		{
			row: r.id,
			check: 'name',
			ok: spec.must_include.every((w) => r.name.toLowerCase().includes(w.toLowerCase()))
		},
		{
			row: r.id,
			check: 'price',
			ok: spec.max_unit_price == null || (r.price ?? Infinity) <= spec.max_unit_price
		},
		{ row: r.id, check: 'listed', ok: r.price != null }
	]);
	return { pass: top.length > 0 && checks.every((c) => c.ok), checks };
}
