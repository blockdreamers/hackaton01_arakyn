import { fail, redirect } from '@sveltejs/kit';
import { and, count, desc, eq, gte, isNull, sql, sum } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { apiCalls, apiKeys, wallets } from '#lib/server/db/schema.ts';
import { generateKey, isMissingTable } from '#lib/server/apikeys.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;
// Example free quota until pricing is set.
const FREE_QUOTA = 1000;

async function guarded<T>(fn: () => Promise<T>, empty: T): Promise<{ value: T; missing: boolean }> {
	try {
		return { value: await fn(), missing: false };
	} catch (err) {
		if (isMissingTable(err)) return { value: empty, missing: true };
		throw err;
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) redirect(303, '/?login=1');

	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

	const keys = await guarded(
		() =>
			db
				.select({
					id: apiKeys.id,
					name: apiKeys.name,
					prefix: apiKeys.prefix,
					createdAt: apiKeys.createdAt,
					lastUsedAt: apiKeys.lastUsedAt,
					revokedAt: apiKeys.revokedAt
				})
				.from(apiKeys)
				.where(eq(apiKeys.userId, user.id))
				.orderBy(desc(apiKeys.createdAt)),
		[]
	);
	const userWallets = await guarded(
		() =>
			db.select().from(wallets).where(eq(wallets.userId, user.id)).orderBy(desc(wallets.createdAt)),
		[]
	);
	const calls = await guarded(
		() =>
			db
				.select()
				.from(apiCalls)
				.where(eq(apiCalls.userId, user.id))
				.orderBy(desc(apiCalls.id))
				.limit(PAGE_SIZE)
				.offset((page - 1) * PAGE_SIZE),
		[]
	);
	const totals = await guarded(
		() =>
			db
				.select({
					calls: count(apiCalls.id),
					inputTokens: sum(apiCalls.inputTokens),
					outputTokens: sum(apiCalls.outputTokens),
					paid: sum(apiCalls.paidUsdc),
					passed: sql<number>`count(*) filter (where ${apiCalls.verifyResult} = 'pass')`,
					verified: sql<number>`count(*) filter (where ${apiCalls.verifyResult} <> 'skipped')`
				})
				.from(apiCalls)
				.where(eq(apiCalls.userId, user.id))
				.then((r) => r[0]),
		undefined
	);
	const monthCalls = await guarded(
		() =>
			db
				.select({ n: count(apiCalls.id) })
				.from(apiCalls)
				.where(and(eq(apiCalls.userId, user.id), gte(apiCalls.requestedAt, monthStart)))
				.then((r) => r[0]?.n ?? 0),
		0
	);

	const t = totals.value;
	return {
		account: {
			name: user.name,
			email: user.email,
			picture: user.picture,
			createdAt: user.createdAt,
			googleSub: user.googleSub.slice(0, 4) + '••••' + user.googleSub.slice(-3)
		},
		migrated: !(keys.missing || userWallets.missing || calls.missing),
		keys: keys.value,
		wallets: userWallets.value,
		calls: calls.value,
		page,
		hasNext: calls.value.length === PAGE_SIZE,
		summary: {
			calls: Number(t?.calls ?? 0),
			tokens: Number(t?.inputTokens ?? 0) + Number(t?.outputTokens ?? 0),
			paidUsdc: Number(t?.paid ?? 0),
			passRate: t && Number(t.verified) > 0 ? Number(t.passed) / Number(t.verified) : null,
			quotaUsed: Number(monthCalls.value),
			quota: FREE_QUOTA
		}
	};
};

export const actions: Actions = {
	createKey: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		const name = String((await request.formData()).get('name') ?? '').trim() || 'Default key';
		const { key, prefix, keyHash } = generateKey();
		try {
			await db
				.insert(apiKeys)
				.values({ userId: locals.user.id, name: name.slice(0, 60), prefix, keyHash });
		} catch (err) {
			if (isMissingTable(err)) return fail(503, { error: 'Account tables are not migrated yet.' });
			throw err;
		}
		return { newKey: key };
	},
	revokeKey: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		const id = Number((await request.formData()).get('id'));
		await db
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(
				and(eq(apiKeys.id, id), eq(apiKeys.userId, locals.user.id), isNull(apiKeys.revokedAt))
			);
		return { revoked: id };
	},
	disconnectWallet: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		const id = Number((await request.formData()).get('id'));
		await db.delete(wallets).where(and(eq(wallets.id, id), eq(wallets.userId, locals.user.id)));
		return { disconnected: id };
	}
};
