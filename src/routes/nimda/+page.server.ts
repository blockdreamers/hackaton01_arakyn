import { fail } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, scrapeRuns, sites } from '#lib/server/db/schema.ts';
import { executeRun, startRun } from '#lib/server/scraper/index.ts';
import { requireAdmin } from '#lib/server/admin.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);

	const siteStats = await db
		.select({
			code: sites.code,
			name: sites.name,
			country: sites.country,
			currency: sites.currency,
			products: count(products.id)
		})
		.from(sites)
		.leftJoin(products, and(eq(products.siteId, sites.id), eq(products.active, true)))
		.groupBy(sites.id);

	const runs = await db
		.select({
			id: scrapeRuns.id,
			site: sites.code,
			status: scrapeRuns.status,
			pagesFetched: scrapeRuns.pagesFetched,
			productsFound: scrapeRuns.productsFound,
			error: scrapeRuns.error,
			startedAt: scrapeRuns.startedAt,
			finishedAt: scrapeRuns.finishedAt
		})
		.from(scrapeRuns)
		.innerJoin(sites, eq(scrapeRuns.siteId, sites.id))
		.orderBy(desc(scrapeRuns.id))
		.limit(10);

	return { siteStats, runs };
};

export const actions: Actions = {
	scrape: async ({ locals, request }) => {
		requireAdmin(locals.user);
		const site = String((await request.formData()).get('site') ?? 'iaansci');

		let started;
		try {
			started = await startRun(db, site);
		} catch (e) {
			return fail(409, { error: e instanceof Error ? e.message : String(e) });
		}
		// runs in the background; progress is stored in scrape_runs
		executeRun(db, started).catch(() => {});
		return { started: started.run.id };
	}
};
