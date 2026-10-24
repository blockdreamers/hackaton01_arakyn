import { building, dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { createDb, type Db } from './client.ts';

if (!DATABASE_URL && !building) throw new Error('DATABASE_URL is not set');

// In dev, HMR re-runs this module on every edit; reuse one client instead of leaking a
// new pool (and its connections) each time.
const cache = globalThis as { __db?: Db };
export const db = dev
	? (cache.__db ??= createDb(DATABASE_URL ?? ''))
	: createDb(DATABASE_URL ?? '');
