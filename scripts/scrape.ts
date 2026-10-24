// Run a scrape from the command line: bun run scrape [site]
import { createDb } from '../src/lib/server/db/client.ts';
import { executeRun, startRun } from '../src/lib/server/scraper/index.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = createDb(url);
await executeRun(db, await startRun(db, process.argv[2] ?? 'iaansci'));
await db.$client.end();
