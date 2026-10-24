// Read-only views of the connected products DB for the data monitor section: live samples across
// every site, a category tree, and a traced keyword search. Prices are also shown in KRW at the same
// fixed rates the search ranks by. No LLM, no writes.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { krwRateSql, searchOffers, toKrw } from '#lib/server/agent/db-search.ts';

const TOP_CATEGORIES = 12;
const ROWS_PER_CATEGORY = 8;

export interface Product {
	id: number;
	name: string;
	price: number | null;
	listPrice: number | null;
	priceKrw: number | null;
	currency: string;
	site: string;
	image: string | null;
	url: string;
	categories: string[];
	firstSeen: string;
	lastSeen: string;
}
export interface SiteInfo {
	code: string;
	name: string;
	country: string;
	currency: string;
	count: number;
	samples: Product[];
}
export interface TreeCategory {
	name: string;
	count: number;
	products: Product[];
}
export interface MonitorTree {
	sites: SiteInfo[];
	totals: { sites: number; products: number; categories: number; lastScraped: string | null };
	categories: TreeCategory[];
	recent: Product[];
}

type Raw = {
	id: number;
	name: string;
	price: string | null;
	list_price: string | null;
	image_url: string | null;
	url: string;
	categories: string[];
	first_seen_at: Date | string;
	last_seen_at: Date | string;
	site: string;
	cur: string;
};

const COLS = sql.raw(`p.id, p.name, p.price, p.list_price, p.image_url, p.url, p.categories,
	p.first_seen_at, p.last_seen_at, s.code as site, s.currency as cur`);
const FROM = sql.raw(`products p join sites s on s.id = p.site_id`);

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();
function toProduct(r: Raw): Product {
	const price = r.price == null ? null : Number(r.price);
	return {
		id: r.id,
		name: r.name,
		price,
		listPrice: r.list_price == null ? null : Number(r.list_price),
		priceKrw: toKrw(price, r.cur),
		currency: r.cur,
		site: r.site,
		image: r.image_url,
		url: r.url,
		categories: r.categories ?? [],
		firstSeen: iso(r.first_seen_at),
		lastSeen: iso(r.last_seen_at)
	};
}

/** Takes up to `n` rows, alternating between sites so no single shop fills the list. */
function interleave(rows: Product[], n: number) {
	const bySite: Record<string, Product[]> = {};
	for (const r of rows) (bySite[r.site] ??= []).push(r);
	const queues = Object.values(bySite);
	const out: Product[] = [];
	while (out.length < n && queues.some((q) => q.length)) {
		for (const q of queues) {
			const r = q.shift();
			if (r && out.length < n) out.push(r);
		}
	}
	return out;
}

let cached: { at: number; tree: MonitorTree } | null = null;

export async function getTree(): Promise<MonitorTree> {
	if (cached && Date.now() - cached.at < 2 * 60_000) return cached.tree;

	const siteRows = await db.execute<{
		id: number;
		code: string;
		name: string;
		country: string;
		currency: string;
		n: number;
	}>(
		sql`select s.id, s.code, s.name, s.country, s.currency, count(p.id)::int as n
			from sites s left join products p on p.site_id = s.id and p.active
			group by s.id order by n desc`
	);
	const siteSamples = await db.execute<Raw & { rn: number }>(
		sql`select * from (select ${COLS}, row_number() over (partition by p.site_id
				order by (p.image_url is null), p.last_seen_at desc, p.id desc) rn
			from ${FROM} where p.active) t where rn <= 4`
	);
	const catRows = await db.execute<{ name: string; n: number }>(
		sql`select c as name, count(*)::int as n from products p, unnest(p.categories) c
			where p.active group by c order by n desc`
	);
	const top = [...catRows].slice(0, TOP_CATEGORIES);
	const catSamples = top.length
		? await db.execute<Raw & { c: string }>(
				sql`select * from (select ${COLS}, c, row_number() over (partition by c, p.site_id
						order by (p.image_url is null), p.id) rn
					from ${FROM}, unnest(p.categories) c
					where p.active and c in ${top.map((t) => t.name)}) t where rn <= ${ROWS_PER_CATEGORY}`
			)
		: [];
	const recent = await db.execute<Raw>(
		sql`select * from (select ${COLS}, row_number() over (partition by p.site_id
				order by p.first_seen_at desc, p.id desc) rn
			from ${FROM} where p.active) t where rn <= 3 order by first_seen_at desc limit 12`
	);
	const [lastRun] = await db.execute<{ at: Date | string | null }>(
		sql`select coalesce(finished_at, started_at) as at from scrape_runs order by started_at desc limit 1`
	);

	const sitesInfo: SiteInfo[] = [...siteRows].map((s) => ({
		code: s.code,
		name: s.name,
		country: s.country,
		currency: s.currency,
		count: s.n,
		samples: [...siteSamples].filter((r) => r.site === s.code).map(toProduct)
	}));
	const tree: MonitorTree = {
		sites: sitesInfo,
		totals: {
			sites: sitesInfo.length,
			products: sitesInfo.reduce((a, s) => a + s.count, 0),
			categories: catRows.length,
			lastScraped: lastRun?.at ? iso(lastRun.at) : null
		},
		categories: top.map((t) => ({
			name: t.name,
			count: t.n,
			products: interleave(
				[...catSamples].filter((r) => r.c === t.name).map(toProduct),
				ROWS_PER_CATEGORY
			)
		})),
		recent: [...recent].map(toProduct)
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
				.map((w) => w.replace(/(으로|에서|를|을|이|가|은|는|와|과|로|의)$/u, ''))
				.filter((w) => w.length >= 2 && !/^\d+[a-z가-힣]{0,2}$/u.test(w) && !STOP.has(w))
		)
	].slice(0, 6);
}

export interface TraceRow extends Product {
	category: string;
	result: 'match' | 'skip';
	reason: string;
}

export async function monitorSearch(q: string) {
	const tree = await getTree();
	const terms = termsOf(q);
	const t0 = performance.now();
	const hit = (s: string) => terms.find((t) => s.toLowerCase().includes(t));
	const anyTerm: SQL = terms.length
		? sql.join(
				terms.map((t) => sql`p.name ilike ${'%' + t + '%'}`),
				sql` or `
			)
		: sql`false`;

	// site stage: matches per shop, with two of the cheapest (in KRW) from each
	const siteHits = await db.execute<Raw & { n: number }>(
		sql`select * from (select ${COLS}, count(*) over (partition by p.site_id)::int as n,
				row_number() over (partition by p.site_id order by p.price * ${krwRateSql('s.currency')} asc nulls last, p.id) rn
			from ${FROM} where p.active and (${anyTerm})) t where rn <= 2`
	);
	const sites = tree.sites.map((s) => {
		const rows = [...siteHits].filter((r) => r.site === s.code);
		return { code: s.code, matches: rows[0]?.n ?? 0, rows: rows.map(toProduct) };
	});

	// category stage: how many matching products each top category holds
	const perCat = await db.execute<{ c: string; n: number }>(
		sql`select c, count(*)::int as n from products p, unnest(p.categories) c
			where p.active and (${anyTerm}) group by c`
	);
	const catHits: Record<string, number> = {};
	for (const r of perCat) catHits[r.c] = r.n;
	const categories = tree.categories.map((c) => ({ name: c.name, matches: catHits[c.name] ?? 0 }));

	// row stage: walk rows in the busiest matching categories, showing what was kept and skipped
	const scanCats = [...categories]
		.filter((c) => c.matches > 0)
		.sort((a, b) => b.matches - a.matches)
		.slice(0, 3);
	const rows: TraceRow[] = [];
	const seen = new Set<number>();
	for (const c of scanCats) {
		const sample = await db.execute<Raw>(
			sql`(select ${COLS} from ${FROM} where p.active and ${c.name} = any(p.categories)
					and (${anyTerm}) order by p.price asc nulls last limit 5)
				union all
				(select ${COLS} from ${FROM} where p.active and ${c.name} = any(p.categories)
					and not (${anyTerm}) order by p.id limit 4)`
		);
		for (const r of [...sample].sort((a, b) => a.id - b.id)) {
			if (seen.has(r.id)) continue;
			seen.add(r.id);
			const m = hit(r.name);
			rows.push({
				...toProduct(r),
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
	const checks = top.map((r) => ({ id: r.id, listed: r.price != null, termInName: !!hit(r.name) }));
	const verified = top.length > 0 && checks.every((c) => c.listed && c.termInName);

	return {
		query: q,
		terms,
		sites,
		categories,
		rows,
		total: result.total,
		top: result.rows,
		dataHash: result.data_hash,
		verify: { pass: verified, checks },
		realMs: Math.round(realMs * 10) / 10
	};
}

export type MonitorSearchResult = Awaited<ReturnType<typeof monitorSearch>>;
