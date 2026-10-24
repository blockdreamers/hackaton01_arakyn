import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { products, scrapeRuns, sites, type RunProgress } from '../db/schema.ts';
import { iaansci } from './sources/iaansci.ts';
import { navimro } from './sources/navimro.ts';
import { daiso, daisoJp } from './sources/daiso-mcp.ts';
import { officedepot } from './sources/officedepot.ts';
import { toolstationUk } from './sources/toolstation-uk.ts';
import { uline } from './sources/uline.ts';
import { hoffmannDe } from './sources/hoffmann-de.ts';
import type { Fetcher, ScrapedProduct, ScrapeOptions, SiteScraper } from './types.ts';

export const scrapers: Record<string, SiteScraper> = {
	[iaansci.code]: iaansci,
	[navimro.code]: navimro,
	[daiso.code]: daiso,
	[daisoJp.code]: daisoJp,
	[officedepot.code]: officedepot,
	[toolstationUk.code]: toolstationUk,
	[uline.code]: uline,
	[hoffmannDe.code]: hoffmannDe
};

export const USER_AGENT = 'AgentCatalogBot/0.1 (+https://agent-catalog.techtree.kr)';
// a run still "running" after this long was killed (e.g. server restart)
const STALE_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function politeFetcher(delayMs: number, onPage: () => void): Fetcher {
	let last = 0;
	return async (url) => {
		for (let attempt = 1; ; attempt++) {
			const wait = last + delayMs - Date.now();
			if (wait > 0) await sleep(wait);
			last = Date.now();
			try {
				const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
				if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
				onPage();
				return await res.text();
			} catch (e) {
				if (attempt >= 3) throw e;
				await sleep(delayMs * 5 * attempt);
			}
		}
	};
}

async function ensureSite(db: Db, s: SiteScraper) {
	const values = {
		code: s.code,
		name: s.name,
		baseUrl: s.baseUrl,
		country: s.country,
		currency: s.currency,
		priceIncludesTax: s.priceIncludesTax
	};
	const [site] = await db
		.insert(sites)
		.values(values)
		.onConflictDoUpdate({ target: sites.code, set: values })
		.returning();
	return site;
}

/** Creates a run row, or throws if one is already running for the site */
export async function startRun(db: Db, code: string, options: ScrapeOptions = {}) {
	const scraper = scrapers[code];
	if (!scraper) throw new Error(`Unknown site: ${code}`);
	const site = await ensureSite(db, scraper);

	await db
		.update(scrapeRuns)
		.set({ status: 'failed', error: 'stale (process stopped)', finishedAt: new Date() })
		.where(
			and(
				eq(scrapeRuns.siteId, site.id),
				eq(scrapeRuns.status, 'running'),
				lt(scrapeRuns.startedAt, new Date(Date.now() - STALE_MS))
			)
		);
	const [running] = await db
		.select({ id: scrapeRuns.id })
		.from(scrapeRuns)
		.where(and(eq(scrapeRuns.siteId, site.id), eq(scrapeRuns.status, 'running')));
	if (running) throw new Error(`Scrape #${running.id} is already running`);

	let resumeFrom: RunProgress | undefined;
	if (options.resumeRunId) {
		const [old] = await db
			.select()
			.from(scrapeRuns)
			.where(and(eq(scrapeRuns.id, options.resumeRunId), eq(scrapeRuns.siteId, site.id)));
		if (!old) throw new Error(`Run #${options.resumeRunId} not found for ${code}`);
		if (!old.progress) throw new Error(`Run #${old.id} has no progress to resume from`);
		// keep the old run's selection (categories / maxPages) unless overridden
		const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
		options = { ...(old.input as ScrapeOptions | null), ...given };
		resumeFrom = old.progress;
	}

	const [run] = await db
		.insert(scrapeRuns)
		.values({ siteId: site.id, status: 'running', input: options })
		.returning();
	return { run, site, scraper, options, resumeFrom };
}

type Started = Awaited<ReturnType<typeof startRun>>;

export async function executeRun(
	db: Db,
	{ run, site, scraper, options, resumeFrom }: Started,
	log = console.log
) {
	let pagesFetched = 0;
	const fetchPage = politeFetcher(scraper.delayMs, () => pagesFetched++);
	const seenThisRun = and(eq(products.siteId, site.id), gte(products.lastSeenAt, run.startedAt));
	const countSeen = async () => {
		const [{ n }] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(products)
			.where(seenThisRun);
		return n;
	};

	// Saved page by page so memory stays flat on large sites. A product listed in several
	// categories collects them during the run. A full run replaces categories from earlier
	// runs; a partial run (some categories / pages) only adds to them.
	// Keyword sources keep groups in `keywords` and never cover the whole site.
	const byKeyword = scraper.groups === 'keywords';
	// a resumed run didn't see the products of the earlier run, so it counts as partial
	const partial =
		byKeyword || !!(options.categories?.length || options.maxPages || options.resumeRunId);
	const union = sql`(select array(select distinct unnest(${products.categories} || excluded.categories)))`;
	const keywordUnion = sql`(select array(select distinct unnest(${products.keywords} || excluded.keywords)))`;
	const save = async (items: ScrapedProduct[], group: string) => {
		const unique = [...new Map(items.map((p) => [p.externalId, p])).values()];
		if (unique.length === 0) return;
		await db
			.insert(products)
			.values(
				unique.map((p) => ({
					...p,
					siteId: site.id,
					...(byKeyword ? { keywords: [group] } : { categories: [group] })
				}))
			)
			.onConflictDoUpdate({
				target: [products.siteId, products.externalId],
				set: {
					name: sql`excluded.name`,
					price: sql`excluded.price`,
					listPrice: sql`excluded.list_price`,
					imageUrl: sql`excluded.image_url`,
					url: sql`excluded.url`,
					brand: sql`excluded.brand`,
					...(byKeyword
						? { keywords: keywordUnion }
						: {
								categories: partial
									? union
									: sql`case when ${products.lastSeenAt} >= ${run.startedAt.toISOString()}
										then ${union} else excluded.categories end`
							}),
					active: true,
					lastSeenAt: sql`now()`
				}
			});
	};

	try {
		const all = await scraper.categories(fetchPage);
		const picked = options.categories ?? [];
		// keyword sources search any given keyword; category sources pick from the site's list
		const categories = !picked.length
			? all
			: byKeyword
				? picked.map((k) => ({ id: k, name: k }))
				: all.filter((c) => picked.includes(c.id));
		log(`[${site.code}] ${categories.length}/${all.length} categories`);
		if (resumeFrom) log(`[${site.code}] resuming after ${JSON.stringify(resumeFrom)}`);

		const progress: RunProgress = { completed: [...(resumeFrom?.completed ?? [])] };
		for (const category of categories) {
			if (progress.completed.includes(category.id)) continue;
			const startPage = resumeFrom?.current?.id === category.id ? resumeFrom.current.page + 1 : 1;
			let found = 0;
			let page = startPage;
			for await (const items of scraper.categoryPages(
				fetchPage,
				category,
				options.maxPages ?? Infinity,
				startPage
			)) {
				await save(items, category.name);
				found += items.length;
				progress.current = { id: category.id, page: page++ };
				progress.updatedAt = new Date().toISOString();
				await db
					.update(scrapeRuns)
					.set({ pagesFetched, progress })
					.where(eq(scrapeRuns.id, run.id));
			}
			progress.completed.push(category.id);
			delete progress.current;
			progress.updatedAt = new Date().toISOString();
			const productsFound = await countSeen();
			await db
				.update(scrapeRuns)
				.set({ pagesFetched, productsFound, progress })
				.where(eq(scrapeRuns.id, run.id));
			log(
				`[${site.code}] ${category.name}: ${found} products (total ${productsFound}, ${pagesFetched} pages)`
			);
		}

		// only a full run can tell that a product is no longer listed
		if (!partial) {
			await db
				.update(products)
				.set({ active: false })
				.where(and(eq(products.siteId, site.id), lt(products.lastSeenAt, run.startedAt)));
		}

		const productsFound = await countSeen();
		await db
			.update(scrapeRuns)
			.set({ status: 'succeeded', pagesFetched, productsFound, finishedAt: new Date() })
			.where(eq(scrapeRuns.id, run.id));
		log(`[${site.code}] done: ${productsFound} products, ${pagesFetched} pages`);
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		await db
			.update(scrapeRuns)
			.set({ status: 'failed', error, pagesFetched, finishedAt: new Date() })
			.where(eq(scrapeRuns.id, run.id));
		log(`[${site.code}] failed: ${error}`);
		throw e;
	}
}
