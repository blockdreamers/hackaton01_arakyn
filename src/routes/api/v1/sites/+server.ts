import { and, count, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, sites } from '#lib/server/db/schema.ts';
import { apiHandler } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

// GET /api/v1/sites
export const GET: RequestHandler = apiHandler(async () => {
	const items = await db
		.select({
			code: sites.code,
			name: sites.name,
			baseUrl: sites.baseUrl,
			country: sites.country,
			currency: sites.currency,
			products: count(products.id)
		})
		.from(sites)
		.leftJoin(products, and(eq(products.siteId, sites.id), eq(products.active, true)))
		.groupBy(sites.id)
		.orderBy(sites.code);
	return { items };
});
