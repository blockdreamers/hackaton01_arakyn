import { and, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { products, sites } from '#lib/server/db/schema.ts';
import { apiHandler, intParam } from '#lib/server/api.ts';
import type { RequestHandler } from './$types';

// GET /api/v1/products?q=&country=&site=&limit=&offset=
export const GET: RequestHandler = apiHandler(async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	const country = url.searchParams.get('country')?.trim().toUpperCase();
	const site = url.searchParams.get('site')?.trim();
	const limit = intParam(url, 'limit', 20, 100) || 20;
	const offset = intParam(url, 'offset', 0, 100_000);

	const filters: SQL[] = [eq(products.active, true)];
	if (q) filters.push(ilike(products.name, `%${q.replace(/[\\%_]/g, '\\$&')}%`));
	if (country) filters.push(eq(sites.country, country));
	if (site) filters.push(eq(sites.code, site));
	const where = and(...filters);

	const [items, [{ total }]] = await Promise.all([
		db
			.select({
				id: products.id,
				site: sites.code,
				country: sites.country,
				currency: sites.currency,
				priceIncludesTax: sites.priceIncludesTax,
				externalId: products.externalId,
				name: products.name,
				price: products.price,
				listPrice: products.listPrice,
				imageUrl: products.imageUrl,
				url: products.url,
				categories: products.categories,
				brand: products.brand,
				rating: products.rating,
				reviewsCount: products.reviewsCount
			})
			.from(products)
			.innerJoin(sites, eq(products.siteId, sites.id))
			.where(where)
			.orderBy(desc(products.lastSeenAt), products.id)
			.limit(limit)
			.offset(offset),
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(products)
			.innerJoin(sites, eq(products.siteId, sites.id))
			.where(where)
	]);

	return { total, limit, offset, items };
});
