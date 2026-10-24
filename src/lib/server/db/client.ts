import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// The managed DB is small (max ~80 connections shared by the server, scripts and every
// developer's dev server), so keep pools small and close idle connections.
export function createDb(url: string, { max = 5 }: { max?: number } = {}) {
	return drizzle(postgres(url, { max, idle_timeout: 20, connect_timeout: 30 }), { schema });
}

export type Db = ReturnType<typeof createDb>;
