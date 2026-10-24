import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { createDb, type Db } from './client.ts';

if (!DATABASE_URL && !building) throw new Error('DATABASE_URL is not set');

// Reuse one pool across dev hot reloads; otherwise every reload opens a new pool and the shared
// database runs out of connection slots.
const g = globalThis as { __agentCatalogDb?: Db };
export const db = (g.__agentCatalogDb ??= createDb(DATABASE_URL ?? ''));
