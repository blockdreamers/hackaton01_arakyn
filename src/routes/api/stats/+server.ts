import { json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { apiRequests, products, sites } from '#lib/server/db/schema.ts';
import { getSearchCount, recordSearch } from '#lib/server/stats.ts';
import type { RequestHandler } from './$types';

// Live numbers for the landing hero: rows in the real catalog and searches served
// served (demo searches on this site plus calls to the public API).
async function body(searches: number) {
	const [[p], [s], [r]] = await Promise.all([
		db.select({ n: count() }).from(products).where(eq(products.active, true)),
		db.select({ n: count() }).from(sites),
		db.select({ n: count() }).from(apiRequests)
	]);
	return { products: p.n, sites: s.n, searches: searches + r.n };
}

export const GET: RequestHandler = async () => json(await body(await getSearchCount()));

// Called once per agent search on the demo page.
export const POST: RequestHandler = async () => json(await body(await recordSearch()));
