import { createHash, randomBytes } from 'node:crypto';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db/index.ts';
import { apiKeys, apiRequests } from './db/schema.ts';

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

/** Revokes the user's current key and returns a new one (shown to the user once) */
export async function issueApiKey(userId: number) {
	const key = `ac_${randomBytes(24).toString('base64url')}`;
	await db.transaction(async (tx) => {
		await tx
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
		await tx.insert(apiKeys).values({ userId, keyHash: hash(key), prefix: key.slice(0, 10) });
	});
	return key;
}

/**
 * Wraps an API handler: authenticates `Authorization: Bearer <key>` and logs the request.
 */
export function apiHandler(handler: (event: RequestEvent) => Promise<unknown>) {
	return async (event: RequestEvent) => {
		const key = event.request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
		const [apiKey] = key
			? await db
					.select()
					.from(apiKeys)
					.where(and(eq(apiKeys.keyHash, hash(key)), isNull(apiKeys.revokedAt)))
			: [];
		if (!apiKey) return json({ error: 'Invalid or missing API key' }, { status: 401 });

		let status = 200;
		try {
			return json(await handler(event));
		} catch (e) {
			status = (e as { status?: number })?.status ?? 500;
			if (status === 500) console.error(e);
			const message = (e as { body?: { message?: string } })?.body?.message ?? 'Internal error';
			return json({ error: message }, { status });
		} finally {
			const { pathname, search } = event.url;
			await db.insert(apiRequests).values({
				userId: apiKey.userId,
				apiKeyId: apiKey.id,
				method: event.request.method,
				path: pathname,
				query: search || null,
				status
			});
			await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));
		}
	};
}

export function intParam(url: URL, name: string, fallback: number, max: number) {
	const raw = url.searchParams.get(name);
	if (raw == null) return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0 || n > max) error(400, `${name} must be an integer 0-${max}`);
	return n;
}
