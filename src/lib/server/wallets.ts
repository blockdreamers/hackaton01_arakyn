import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import { agentWallets } from './db/schema.ts';

export function listWallets(userId: number) {
	return db
		.select()
		.from(agentWallets)
		.where(eq(agentWallets.userId, userId))
		.orderBy(asc(agentWallets.createdAt));
}

/** Adds the wallet, or refreshes verifiedAt if this user already connected it (one statement, so concurrent connects can't overwrite each other) */
export async function saveWallet(userId: number, address: string) {
	await db
		.insert(agentWallets)
		.values({ userId, address: address.toLowerCase(), verifiedAt: new Date() })
		.onConflictDoUpdate({
			target: [agentWallets.userId, agentWallets.address],
			set: { verifiedAt: sql`now()` }
		});
}

export async function removeWallet(userId: number, id: number) {
	await db
		.delete(agentWallets)
		.where(and(eq(agentWallets.userId, userId), eq(agentWallets.id, id)));
}
