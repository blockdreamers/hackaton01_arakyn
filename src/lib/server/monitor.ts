// Read-only views of the connected products DB for the data monitor section:
// a compact tree (site → top categories → a few products) and a traced keyword search.
// No LLM, no writes.
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, scrapeRuns, sites } from '#lib/server/db/schema.ts';
import { searchOffers } from '#lib/server/agent/db-search.ts';

const TOP_CATEGORIES = 12;
const ROWS_PER_CATEGORY = 5;

export interface TreeProduct {
	id: number;
	name: string;
	price: number | null;
	currency: string;
}
export interface TreeCategory {
	name: string;
	count: number;
	products: TreeProduct[];
}
export interface MonitorTree {
	site: { code: string; name: string; country: string; currency: string };
	sites: { code: string; name: string; country: string; currency: string; count: number }[];
	totals: { sites: number; products: number; categories: number; lastScraped: string | null };
	categories: TreeCategory[];
}

let cached: { at: number; tree: MonitorTree } | null = null;

export async function getTree(): Promise<MonitorTree> {
	if (cached && Date.now() - cached.at < 5 * 60_000) return cached.tree;
	const [site] = await db.select().from(sites).orderBy(sites.id).limit(1);
	const siteRows = await db
		.select({
			code: sites.code,
			name: sites.name,
			country: sites.country,
			currency: sites.currency,
			count: sql<number>`count(${products.id})::int`
		})
		.from(sites)
		.leftJoin(products, sql`${products.siteId} = ${sites.id} and ${products.active}`)
		.groupBy(sites.id)
		.orderBy(sites.id);
	const siteCount = siteRows.length;
	const [{ n: productCount }] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(products)
		.where(eq(products.active, true));
	const catRows = await db.execute<{ name: string; n: number }>(
		sql`select c as name, count(*)::int as n from ${products}, unnest(${products.categories}) c
			where ${products.active} group by c order by n desc`
	);
	const [lastRun] = await db
		.select({ at: scrapeRuns.finishedAt })
		.from(scrapeRuns)
		.orderBy(desc(scrapeRuns.startedAt))
		.limit(1);

	const top = [...catRows].slice(0, TOP_CATEGORIES);
	const sampleRows = await db.execute<{
		c: string;
		id: number;
		name: string;
		price: string | null;
		cur: string;
	}>(
		sql`select c, id, name, price, cur from (
			select c, ${products.id} as id, ${products.name} as name, ${products.price} as price,
				(select s.currency from sites s where s.id = site_id) as cur,
				row_number() over (partition by c order by ${products.id}) rn
			from ${products}, unnest(${products.categories}) c
			where ${products.active} and c in ${top.length ? top.map((t) => t.name) : ['']}
		) t where rn <= ${ROWS_PER_CATEGORY}`
	);
	const categories: TreeCategory[] = top.map((t) => ({
		name: t.name,
		count: t.n,
		products: [...sampleRows]
			.filter((r) => r.c === t.name)
			.map((r) => ({
				id: r.id,
				name: r.name,
				price: r.price == null ? null : Number(r.price),
				currency: r.cur
			}))
	}));

	const tree: MonitorTree = {
		site: {
			code: site?.code ?? '-',
			name: site?.name ?? '-',
			country: site?.country ?? '-',
			currency: site?.currency ?? '-'
		},
		sites: siteRows,
		totals: {
			sites: siteCount,
			products: productCount,
			categories: catRows.length,
			lastScraped: lastRun?.at ? lastRun.at.toISOString() : null
		},
		categories
	};
	cached = { at: Date.now(), tree };
	return tree;
}

const STOP = new Set([
	'개',
	'개당',
	'가장',
	'싼',
	'곳',
	'찾아줘',
	'알려줘',
	'필요해',
	'이하',
	'pcs',
	'the',
	'for'
]);

/** Simple keyword split: no LLM, so the monitor costs nothing to run. */
export function termsOf(q: string) {
	return [
		...new Set(
			q
				.toLowerCase()
				.split(/[\s,.;:!?()[\]{}"'“”·/]+/)
				.map((w) => w.replace(/(으로|에서|으로|를|을|이|가|은|는|와|과|로|의)$/u, ''))
				.filter((w) => w.length >= 2 && !/^\d+[a-z가-힣]{0,2}$/u.test(w) && !STOP.has(w))
		)
	].slice(0, 6);
}

export interface TraceRow {
	id: number;
	name: string;
	price: number | null;
	currency: string;
	category: string;
	result: 'match' | 'skip';
	reason: string;
}

export async function monitorSearch(q: string) {
	const tree = await getTree();
	const terms = termsOf(q);
	const t0 = performance.now();
	const hit = (s: string) => terms.find((t) => s.toLowerCase().includes(t));

	// category stage: how many matching products each top category holds
	const perCat = terms.length
		? await db.execute<{ c: string; n: number }>(
				sql`select c, count(*)::int as n from ${products}, unnest(${products.categories}) c
				where ${products.active} and (${sql.join(
					terms.map((t) => sql`${products.name} ilike ${'%' + t + '%'}`),
					sql` or `
				)}) group by c`
			)
		: [];
	const catHits = new Map([...perCat].map((r) => [r.c, r.n]));
	const categories = tree.categories.map((c) => ({
		name: c.name,
		matches: catHits.get(c.name) ?? 0
	}));

	// row stage: walk a few rows in each matching category, showing what was kept and skipped
	const scanCats = [...categories]
		.filter((c) => c.matches > 0)
		.sort((a, b) => b.matches - a.matches)
		.slice(0, 4);
	const rows: TraceRow[] = [];
	for (const c of scanCats) {
		const sample = await db.execute<{
			id: number;
			name: string;
			price: string | null;
			cur: string;
		}>(
			sql`(select id, name, price, (select s.currency from sites s where s.id = site_id) as cur from ${products} where ${products.active} and ${c.name} = any(${products.categories})
				and (${sql.join(
					terms.map((t) => sql`${products.name} ilike ${'%' + t + '%'}`),
					sql` or `
				)}) order by price asc nulls last limit 4)
			union all
			(select id, name, price, (select s.currency from sites s where s.id = site_id) as cur from ${products} where ${products.active} and ${c.name} = any(${products.categories})
				and not (${sql.join(
					terms.map((t) => sql`${products.name} ilike ${'%' + t + '%'}`),
					sql` or `
				)}) order by id limit 4)`
		);
		const list = [...sample].sort((a, b) => a.id - b.id);
		for (const r of list) {
			const m = hit(r.name);
			rows.push({
				id: r.id,
				name: r.name,
				price: r.price == null ? null : Number(r.price),
				currency: r.cur,
				category: c.name,
				result: m ? 'match' : 'skip',
				reason: m ? `name has “${m}”` : 'no search term in name'
			});
		}
	}

	const result = terms.length
		? await searchOffers({ terms, limit: 10 })
		: { rows: [], total: 0, data_hash: '0x0' };
	const realMs = performance.now() - t0;
	const top = result.rows.slice(0, 3);
	const checks = top.map((r) => ({
		id: r.id,
		listed: r.price != null,
		termInName: !!hit(r.name)
	}));
	const verified = top.length > 0 && checks.every((c) => c.listed && c.termInName);

	return {
		query: q,
		terms,
		categories,
		rows,
		total: result.total,
		top: result.rows,
		dataHash: result.data_hash,
		verify: { pass: verified, checks },
		realMs: Math.round(realMs * 10) / 10,
		currency: tree.site.currency
	};
}

export type MonitorSearchResult = Awaited<ReturnType<typeof monitorSearch>>;
