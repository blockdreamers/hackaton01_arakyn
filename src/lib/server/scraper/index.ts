import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { products, scrapeRuns, sites } from '../db/schema.ts';
import { iaansci } from './sources/iaansci.ts';
import type { Fetcher, ScrapedProduct, SiteScraper } from './types.ts';

export const scrapers: Record<string, SiteScraper> = { [iaansci.code]: iaansci };

const USER_AGENT = 'AgentCatalogBot/0.1 (+https://agent-catalog.techtree.kr)';
const DELAY_MS = 1000;
// a run still "running" after this long was killed (e.g. server restart)
const STALE_MS = 2 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function politeFetcher(onPage: () => void): Fetcher {
	let last = 0;
	return async (url) => {
		for (let attempt = 1; ; attempt++) {
			const wait = last + DELAY_MS - Date.now();
			if (wait > 0) await sleep(wait);
			last = Date.now();
			try {
				const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
				if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
				onPage();
				return await res.text();
			} catch (e) {
				if (attempt >= 3) throw e;
				await sleep(DELAY_MS * 5 * attempt);
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
		currency: s.currency
	};
	const [site] = await db
		.insert(sites)
		.values(values)
		.onConflictDoUpdate({ target: sites.code, set: values })
		.returning();
	return site;
}

/** Creates a run row, or throws if one is already running for the site */
export async function startRun(db: Db, code: string) {
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

	const [run] = await db
		.insert(scrapeRuns)
		.values({ siteId: site.id, status: 'running' })
		.returning();
	return { run, site, scraper };
}

type Started = Awaited<ReturnType<typeof startRun>>;

export async function executeRun(db: Db, { run, site, scraper }: Started, log = console.log) {
	let pagesFetched = 0;
	const fetchPage = politeFetcher(() => pagesFetched++);
	// product -> categories seen in this run
	const seen = new Map<string, { product: ScrapedProduct; categories: Set<string> }>();

	const flush = async (ids: Iterable<string>) => {
		const rows = [...ids].map((id) => {
			const { product, categories } = seen.get(id)!;
			return { ...product, siteId: site.id, categories: [...categories], active: true };
		});
		for (let i = 0; i < rows.length; i += 500) {
			await db
				.insert(products)
				.values(rows.slice(i, i + 500))
				.onConflictDoUpdate({
					target: [products.siteId, products.externalId],
					set: {
						name: sql`excluded.name`,
						price: sql`excluded.price`,
						listPrice: sql`excluded.list_price`,
						imageUrl: sql`excluded.image_url`,
						url: sql`excluded.url`,
						categories: sql`excluded.categories`,
						active: true,
						lastSeenAt: sql`now()`
					}
				});
		}
	};

	try {
		const categories = await scraper.categories(fetchPage);
		log(`[${site.code}] ${categories.length} categories`);

		for (const category of categories) {
			const touched = new Set<string>();
			for await (const items of scraper.categoryPages(fetchPage, category)) {
				for (const product of items) {
					const entry = seen.get(product.externalId);
					if (entry) entry.categories.add(category.name);
					else seen.set(product.externalId, { product, categories: new Set([category.name]) });
					touched.add(product.externalId);
				}
			}
			await flush(touched);
			await db
				.update(scrapeRuns)
				.set({ pagesFetched, productsFound: seen.size })
				.where(eq(scrapeRuns.id, run.id));
			log(
				`[${site.code}] ${category.name}: ${touched.size} products (total ${seen.size}, ${pagesFetched} pages)`
			);
		}

		// anything not seen in this full run is no longer listed
		await db
			.update(products)
			.set({ active: false })
			.where(and(eq(products.siteId, site.id), lt(products.lastSeenAt, run.startedAt)));

		await db
			.update(scrapeRuns)
			.set({ status: 'succeeded', pagesFetched, productsFound: seen.size, finishedAt: new Date() })
			.where(eq(scrapeRuns.id, run.id));
		log(`[${site.code}] done: ${seen.size} products, ${pagesFetched} pages`);
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		await db
			.update(scrapeRuns)
			.set({
				status: 'failed',
				error,
				pagesFetched,
				productsFound: seen.size,
				finishedAt: new Date()
			})
			.where(eq(scrapeRuns.id, run.id));
		log(`[${site.code}] failed: ${error}`);
		throw e;
	}
}
