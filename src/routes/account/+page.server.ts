import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { apiKeys, apiRequests } from '#lib/server/db/schema.ts';
import { issueApiKey } from '#lib/server/api.ts';
import { readCalls } from '#lib/server/local-store.ts';
import { listWallets, removeWallet } from '#lib/server/wallets.ts';
import type { CallLogEntry } from '#lib/server/calls.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;
// Example free quota until pricing is set.
const FREE_QUOTA = 1000;

interface Row {
	key: string;
	id: number;
	query: string;
	lane: string;
	mode: string;
	verifyResult: string;
	requestedAt: Date;
	receivedAt: Date;
	paidUsdc: number;
	paymentTx: string | null;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	spec: unknown;
	verifyDetail: unknown;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) redirect(303, '/?login=1');

	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

	const [keys, requests, wallets, agentCalls] = await Promise.all([
		db.select().from(apiKeys).where(eq(apiKeys.userId, user.id)).orderBy(desc(apiKeys.createdAt)),
		db
			.select()
			.from(apiRequests)
			.where(eq(apiRequests.userId, user.id))
			.orderBy(desc(apiRequests.createdAt))
			.limit(500),
		listWallets(user.id),
		readCalls()
	]);

	// One history: agent searches from the site (tokens, verification, payment) and public API calls.
	const rows: Row[] = [
		...(agentCalls as unknown as CallLogEntry[])
			.filter((c) => c.userId === user.id)
			.map((c) => ({
				...c,
				key: 'a',
				requestedAt: new Date(c.requestedAt),
				receivedAt: new Date(c.receivedAt),
				paymentTx: c.paymentTx ?? null
			})),
		...requests.map((r) => ({
			key: 'r',
			query: `${r.method} ${r.path}${r.query ?? ''}`,
			lane: 'api',
			mode: `HTTP ${r.status}`,
			verifyResult: 'skipped',
			requestedAt: r.createdAt,
			receivedAt: r.createdAt,
			paidUsdc: 0,
			paymentTx: null,
			inputTokens: 0,
			outputTokens: 0,
			costUsd: 0,
			spec: null,
			verifyDetail: null
		}))
	]
		.sort((a, b) => +a.requestedAt - +b.requestedAt)
		.map((r, i) => ({ ...r, id: i + 1 }))
		.reverse() as Row[];

	const verified = rows.filter((r) => r.verifyResult !== 'skipped');
	return {
		account: {
			name: user.name,
			email: user.email,
			picture: user.picture,
			createdAt: user.createdAt,
			googleSub: user.googleSub.slice(0, 4) + '••••' + user.googleSub.slice(-3)
		},
		migrated: true,
		keys: keys.map((k) => ({ ...k, name: 'API key' })),
		wallets,
		calls: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		page,
		hasNext: rows.length > page * PAGE_SIZE,
		summary: {
			calls: rows.length,
			tokens: rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
			paidUsdc: rows.reduce((n, r) => n + r.paidUsdc, 0),
			passRate: verified.length
				? verified.filter((r) => r.verifyResult === 'pass').length / verified.length
				: null,
			quotaUsed: rows.filter((r) => r.requestedAt >= monthStart).length,
			quota: FREE_QUOTA
		}
	};
};

export const actions: Actions = {
	// One active key per user (same rule as /dashboard): issuing a new one revokes the old one.
	createKey: async ({ locals }) => {
		if (!locals.user) return fail(401);
		return { newKey: await issueApiKey(locals.user.id) };
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
		await removeWallet(locals.user.id, Number((await request.formData()).get('id')));
		return { disconnected: true };
	}
};
