import { json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, sites } from '#lib/server/db/schema.ts';
import { getSearchCount, recordSearch } from '#lib/server/stats.ts';
import type { RequestHandler } from './$types';

// Live numbers for the landing hero: rows in the real catalog and searches served
// served on this site.
async function body(searches: number) {
	const [[p], [s]] = await Promise.all([
		db.select({ n: count() }).from(products).where(eq(products.active, true)),
		db.select({ n: count() }).from(sites)
	]);
	// TODO after pulling main: add the public API's api_requests count to searches
	return { products: p.n, sites: s.n, searches };
}

export const GET: RequestHandler = async () => json(await body(await getSearchCount()));

// Called once per agent search on the demo page.
export const POST: RequestHandler = async () => json(await body(await recordSearch()));
