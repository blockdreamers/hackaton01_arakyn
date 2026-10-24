import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { products, scrapeRuns, siteChecks, sites } from '../db/schema.ts';
import { scrapers, USER_AGENT } from '../scraper/index.ts';
import type { ScrapedProduct } from '../scraper/types.ts';
import { AI_AGENTS, blocksAllFor, groupFor, isAllowed, parseRobots } from './robots.ts';

// Deterministic checks the monitor agent calls as tools. Each returns a plain JSON summary
// and stores policy/parser results in site_checks so the next run can diff against them.

const BOT_MARKERS =
	/captcha|px-captcha|perimeterx|datadome|shieldsquare|perfdrive|cf-chl|challenge-platform|access denied/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const siteCodes = () => Object.keys(scrapers);

function scraperFor(code: string) {
	const scraper = scrapers[code];
	if (!scraper) throw new Error(`Unknown site: ${code}. Known: ${siteCodes().join(', ')}`);
	return scraper;
}

async function lastCheck(db: Db, code: string, kind: 'policy' | 'parser') {
	const [row] = await db
		.select()
		.from(siteChecks)
		.where(and(eq(siteChecks.siteCode, code), eq(siteChecks.kind, kind)))
		.orderBy(desc(siteChecks.id))
		.limit(1);
	return row as (typeof row & { data: Record<string, unknown> }) | undefined;
}

async function probe(url: string) {
	try {
		const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'manual' });
		const body = await res.text();
		return {
			status: res.status,
			location: res.headers.get('location'),
			botChallenge:
				BOT_MARKERS.test(body.slice(0, 20000)) ||
				/perfdrive|captcha/i.test(res.headers.get('location') ?? ''),
			body
		};
	} catch (e) {
		return { status: 0, location: null, botChallenge: false, body: '', error: String(e) };
	}
}

/** robots.txt rules for us, AI-crawler stance, bot protection, and whether our URLs are still allowed */
export async function checkPolicy(db: Db, code: string) {
	const scraper = scraperFor(code);
	const base = scraper.crawlBaseUrl ?? scraper.baseUrl;
	const robotsRes = await probe(new URL('/robots.txt', base).toString());
	const robotsText = robotsRes.status === 200 ? robotsRes.body : '';
	const groups = parseRobots(robotsText);
	const ours = groupFor(groups, USER_AGENT);

	// URLs we really request: from the last parser check, plus a few stored product links
	const prevParser = await lastCheck(db, code, 'parser');
	const fetched = ((prevParser?.data.fetchedUrls as string[] | undefined) ?? []).slice(0, 20);
	const productUrls = (
		await db
			.select({ url: products.url })
			.from(products)
			.innerJoin(sites, eq(products.siteId, sites.id))
			.where(eq(sites.code, code))
			.orderBy(desc(products.lastSeenAt))
			.limit(3)
	).map((r) => r.url);
	const sampleUrls = [...new Set([base, ...fetched, ...productUrls])];
	const disallowed = sampleUrls
		.map((url) => ({ url, ...isAllowed(ours, url) }))
		.filter((r) => !r.allowed)
		.map((r) => ({ url: r.url, rule: r.rule?.path }));

	await sleep(scraper.delayMs);
	const home = await probe(base);

	const robotsHash = sha(robotsText);
	const prev = await lastCheck(db, code, 'policy');
	const prevRules = (prev?.data.ourRules as string[] | undefined) ?? [];
	const ourRules = (ours?.rules ?? []).map((r) => `${r.allow ? 'Allow' : 'Disallow'}: ${r.path}`);
	const crawlDelayMs = ours?.crawlDelay !== undefined ? ours.crawlDelay * 1000 : undefined;

	const data = {
		base,
		robotsStatus: robotsRes.status,
		robotsHash,
		robotsChanged: prev ? prev.data.robotsHash !== robotsHash : null,
		ruleGroupUsed: ours ? ours.agents.join(', ') : null,
		ourRules,
		rulesAdded: prev ? ourRules.filter((r) => !prevRules.includes(r)) : [],
		rulesRemoved: prev ? prevRules.filter((r) => !ourRules.includes(r)) : [],
		crawlDelayMs,
		ourDelayMs: scraper.delayMs,
		delayTooShort: crawlDelayMs !== undefined && scraper.delayMs < crawlDelayMs,
		aiCrawlersBlockedEntirely: AI_AGENTS.filter((a) => blocksAllFor(groups, a)),
		sampleUrlsChecked: sampleUrls.length,
		disallowedUrls: disallowed,
		home: { status: home.status, location: home.location, botChallenge: home.botChallenge }
	};
	const ok =
		robotsRes.status !== 0 &&
		disallowed.length === 0 &&
		!data.delayTooShort &&
		!home.botChallenge &&
		home.status > 0 &&
		home.status < 400;
	await db.insert(siteChecks).values({ siteCode: code, kind: 'policy', ok, data });
	return { site: code, ok, ...data, previousCheckAt: prev?.createdAt ?? null };
}

/** Runs the real scraper on one category page and compares field coverage with history */
export async function checkParser(db: Db, code: string) {
	const scraper = scraperFor(code);
	const fetchedUrls: string[] = [];
	let last = 0;
	const fetchPage = async (url: string) => {
		const wait = last + scraper.delayMs - Date.now();
		if (wait > 0) await sleep(wait);
		last = Date.now();
		fetchedUrls.push(url);
		const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
		return res.text();
	};

	let categoryCount = 0;
	let sampleCategory: string | null = null;
	let items: ScrapedProduct[] = [];
	let error: string | null = null;
	try {
		const categories = await scraper.categories(fetchPage);
		categoryCount = categories.length;
		if (categories[0]) {
			sampleCategory = `${categories[0].name} (${categories[0].id})`;
			for await (const page of scraper.categoryPages(fetchPage, categories[0], 1)) {
				items = page;
				break;
			}
		}
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}

	const missing = (f: (p: ScrapedProduct) => unknown) => items.filter((p) => !f(p)).length;
	const coverage = {
		items: items.length,
		missingName: missing((p) => p.name),
		missingPrice: missing((p) => p.price != null),
		missingImage: missing((p) => p.imageUrl),
		missingUrl: missing((p) => p.url),
		missingBrand: missing((p) => p.brand)
	};
	const [stored] = await db
		.select({
			total: sql<number>`count(*)::int`,
			noPrice: sql<number>`count(*) filter (where ${products.price} is null)::int`,
			noImage: sql<number>`count(*) filter (where ${products.imageUrl} is null)::int`
		})
		.from(products)
		.innerJoin(sites, eq(products.siteId, sites.id))
		.where(eq(sites.code, code));
	const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

	const prev = await lastCheck(db, code, 'parser');
	const data = {
		categoryCount,
		previousCategoryCount: (prev?.data.categoryCount as number | undefined) ?? null,
		sampleCategory,
		coverage,
		missingPricePct: rate(coverage.missingPrice, coverage.items),
		missingImagePct: rate(coverage.missingImage, coverage.items),
		storedMissingPricePct: rate(stored.noPrice, stored.total),
		storedMissingImagePct: rate(stored.noImage, stored.total),
		storedProducts: stored.total,
		sampleItems: items.slice(0, 2),
		requests: fetchedUrls.length,
		fetchedUrls: fetchedUrls.slice(0, 30),
		error
	};
	const ok =
		!error && coverage.items > 0 && coverage.missingName === 0 && coverage.missingUrl === 0;
	await db.insert(siteChecks).values({ siteCode: code, kind: 'parser', ok, data });
	// fetched URLs are kept for the policy check but are noise in the agent's context
	return {
		site: code,
		ok,
		...data,
		fetchedUrls: undefined,
		previousCheckAt: prev?.createdAt ?? null
	};
}

/** Per-site run health from the database: failures, stalls, staleness, counts */
export async function scrapeStatus(db: Db) {
	const now = Date.now();
	const allSites = await db.select().from(sites).orderBy(sites.code);
	const out = [];
	for (const site of allSites) {
		const [counts] = await db
			.select({
				total: sql<number>`count(*)::int`,
				active: sql<number>`count(*) filter (where ${products.active})::int`,
				lastSavedAt: sql<string | null>`max(${products.lastSeenAt})::text`
			})
			.from(products)
			.where(eq(products.siteId, site.id));
		const lastSaved = counts.lastSavedAt ? Date.parse(counts.lastSavedAt) : 0;
		const runs = await db
			.select()
			.from(scrapeRuns)
			.where(eq(scrapeRuns.siteId, site.id))
			.orderBy(desc(scrapeRuns.id))
			.limit(5);
		const lastSuccess = runs.find((r) => r.status === 'succeeded');
		const running = runs
			.filter((r) => r.status === 'running')
			.map((r) => {
				// progress.updatedAt is written per page; older runs lack it, so also use the last
				// time a product of this site was saved (also once per page)
				const updated = Math.max(
					r.progress?.updatedAt ? Date.parse(r.progress.updatedAt) : 0,
					lastSaved,
					r.startedAt.getTime()
				);
				const idleMin = Math.round((now - updated) / 60000);
				return {
					id: r.id,
					startedAt: r.startedAt,
					pagesFetched: r.pagesFetched,
					progress: r.progress,
					minutesSinceLastProgress: idleMin,
					// progress is written after every page; 30 min of silence means it is stuck or dead
					likelyStalled: idleMin > 30
				};
			});
		out.push({
			site: site.code,
			country: site.country,
			currency: site.currency,
			registered: site.code in scrapers || site.code === 'amazon_us',
			products: { total: counts.total, active: counts.active, lastSavedAt: counts.lastSavedAt },
			lastRun: runs[0]
				? {
						id: runs[0].id,
						status: runs[0].status,
						startedAt: runs[0].startedAt,
						finishedAt: runs[0].finishedAt,
						error: runs[0].error
					}
				: null,
			lastSuccessAt: lastSuccess?.finishedAt ?? null,
			daysSinceLastSuccess: lastSuccess?.finishedAt
				? Math.round(((now - lastSuccess.finishedAt.getTime()) / 86400000) * 10) / 10
				: null,
			running,
			recentFailures: runs
				.filter((r) => r.status === 'failed')
				.map((r) => ({ id: r.id, error: r.error, finishedAt: r.finishedAt }))
		});
	}
	return { checkedAt: new Date(now).toISOString(), sites: out };
}
