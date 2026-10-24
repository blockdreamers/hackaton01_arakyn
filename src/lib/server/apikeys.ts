import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'ac_live_';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

// Returns the full key (shown to the user once) plus what we store.
export function generateKey() {
	const key = PREFIX + randomBytes(24).toString('base64url');
	return { key, prefix: key.slice(0, PREFIX.length + 4), keyHash: hashKey(key) };
}

// Postgres "relation does not exist": the account tables haven't been migrated yet.
export function isMissingTable(err: unknown) {
	const e = err as { code?: string; cause?: { code?: string } };
	return e?.code === '42P01' || e?.cause?.code === '42P01';
}
