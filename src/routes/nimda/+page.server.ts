import { fail } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, scrapeRuns, sites } from '#lib/server/db/schema.ts';
import { executeRun, scrapers, startRun } from '#lib/server/scraper/index.ts';
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
			priceIncludesTax: sites.priceIncludesTax,
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

	return { siteStats, runs, scrapers: Object.keys(scrapers) };
};

export const actions: Actions = {
	scrape: async ({ locals, request }) => {
		requireAdmin(locals.user);
		const form = await request.formData();
		const site = String(form.get('site') ?? '');
		const categories = String(form.get('categories') ?? '')
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		const maxPages = Number(form.get('maxPages')) || undefined;
		const resumeRunId = Number(form.get('resume')) || undefined;

		let started;
		try {
			started = await startRun(db, site, {
				categories: categories.length ? categories : undefined,
				maxPages,
				resumeRunId
			});
		} catch (e) {
			return fail(409, { error: e instanceof Error ? e.message : String(e) });
		}
		// runs in the background; progress is stored in scrape_runs
		executeRun(db, started).catch(() => {});
		return { started: started.run.id };
	}
};
