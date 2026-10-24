import { redirect } from '@sveltejs/kit';
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { apiKeys, apiRequests } from '#lib/server/db/schema.ts';
import { issueApiKey } from '#lib/server/api.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	const userId = locals.user.id;

	const [apiKey] = await db
		.select({
			prefix: apiKeys.prefix,
			createdAt: apiKeys.createdAt,
			lastUsedAt: apiKeys.lastUsedAt
		})
		.from(apiKeys)
		.where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

	const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	const countSince = async (from?: Date) => {
		const [row] = await db
			.select({ n: count() })
			.from(apiRequests)
			.where(
				and(eq(apiRequests.userId, userId), from ? gte(apiRequests.createdAt, from) : undefined)
			);
		return row.n;
	};
	const [day, week, total] = await Promise.all([
		countSince(since(1)),
		countSince(since(7)),
		countSince()
	]);

	const recent = await db
		.select({
			id: apiRequests.id,
			method: apiRequests.method,
			path: apiRequests.path,
			query: apiRequests.query,
			status: apiRequests.status,
			createdAt: apiRequests.createdAt
		})
		.from(apiRequests)
		.where(eq(apiRequests.userId, userId))
		.orderBy(desc(apiRequests.id))
		.limit(20);

	return { apiKey: apiKey ?? null, usage: { day, week, total }, recent };
};

export const actions: Actions = {
	issueKey: async ({ locals }) => {
		if (!locals.user) redirect(303, '/');
		return { key: await issueApiKey(locals.user.id) };
	}
};
