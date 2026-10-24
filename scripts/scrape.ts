// Run a scrape from the command line:
//   bun run scrape [site] [--categories c-23,c-24] [--max-pages 10] [--resume <runId>]
import { parseArgs } from 'node:util';
import { createDb } from '../src/lib/server/db/client.ts';
import { executeRun, startRun } from '../src/lib/server/scraper/index.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		categories: { type: 'string' },
		'max-pages': { type: 'string' },
		resume: { type: 'string' }
	}
});

const db = createDb(url, { max: 2 });
await executeRun(
	db,
	await startRun(db, positionals[0] ?? 'iaansci', {
		categories: values.categories?.split(',').map((c) => c.trim()),
		maxPages: values['max-pages'] ? Number(values['max-pages']) : undefined,
		resumeRunId: values.resume ? Number(values.resume) : undefined
	})
);
await db.$client.end();
