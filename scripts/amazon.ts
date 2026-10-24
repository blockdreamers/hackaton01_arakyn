// Bright Data "Amazon products - discover by keyword" (costs money per record)
//   bun run amazon trigger [--limit-per-keyword 90] [--max-total 9500] [--keywords "a,b"]
//   bun run amazon collect [runId]   (waits for the snapshot, then stores products)
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { products, scrapeRuns, sites } from '../src/lib/server/db/schema.ts';
import { BrightData } from '../src/lib/server/brightdata/client.ts';
import {
	amazonUs,
	mapRecord,
	triggerKeywordDiscovery
} from '../src/lib/server/brightdata/amazon.ts';

const { DATABASE_URL, BRIGHTDATA_API_TOKEN } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!BRIGHTDATA_API_TOKEN) throw new Error('BRIGHTDATA_API_TOKEN is not set');

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		'limit-per-keyword': { type: 'string', default: '90' },
		'max-total': { type: 'string', default: '9500' },
		keywords: { type: 'string' }
	}
});
const [command, runArg] = positionals;

const db = createDb(DATABASE_URL);
const bd = new BrightData(BRIGHTDATA_API_TOKEN);

const [site] = await db
	.insert(sites)
	.values(amazonUs)
	.onConflictDoUpdate({ target: sites.code, set: amazonUs })
	.returning();

if (command === 'trigger') {
	const keywords = values.keywords
		? values.keywords.split(',')
		: readFileSync(new URL('./amazon-keywords.txt', import.meta.url), 'utf8').split('\n');
	const input = [...new Set(keywords.map((k) => k.trim()).filter((k) => k && !k.startsWith('#')))];
	const limitPerInput = Number(values['limit-per-keyword']);
	const maxTotal = Number(values['max-total']);

	const snapshotId = await triggerKeywordDiscovery(bd, input, { limitPerInput, maxTotal });
	const [run] = await db
		.insert(scrapeRuns)
		.values({
			siteId: site.id,
			status: 'running',
			externalJobId: snapshotId,
			input: { keywords: input, limitPerInput, maxTotal }
		})
		.returning();
	console.log(
		`run #${run.id}: snapshot ${snapshotId}, ${input.length} keywords, ` +
			`<= ${limitPerInput}/keyword, <= ${maxTotal} total`
	);
} else if (command === 'collect') {
	const [run] = await db
		.select()
		.from(scrapeRuns)
		.where(
			runArg
				? eq(scrapeRuns.id, Number(runArg))
				: and(eq(scrapeRuns.siteId, site.id), isNotNull(scrapeRuns.externalJobId))
		)
		.orderBy(desc(scrapeRuns.id))
		.limit(1);
	if (!run?.externalJobId) throw new Error('No Bright Data run found');

	for (;;) {
		const { status } = await bd.progress(run.externalJobId);
		console.log(`snapshot ${run.externalJobId}: ${status}`);
		if (status === 'ready') break;
		if (status === 'failed' || status === 'canceled') {
			await db
				.update(scrapeRuns)
				.set({ status: 'failed', error: `snapshot ${status}`, finishedAt: new Date() })
				.where(eq(scrapeRuns.id, run.id));
			throw new Error(`snapshot ${status}`);
		}
		await new Promise((r) => setTimeout(r, 30_000));
	}

	const records = await bd.download<Record<string, unknown>>(run.externalJobId);
	const rows = records.flatMap((r) => {
		const p = mapRecord(r);
		return p ? [{ ...p, siteId: site.id }] : [];
	});

	// same ASIN can come back for several keywords: merge before upserting
	const byAsin = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		const prev = byAsin.get(row.externalId);
		if (prev) prev.keywords = [...new Set([...prev.keywords, ...row.keywords])];
		else byAsin.set(row.externalId, row);
	}
	const unique = [...byAsin.values()];

	for (let i = 0; i < unique.length; i += 500) {
		await db
			.insert(products)
			.values(unique.slice(i, i + 500))
			.onConflictDoUpdate({
				target: [products.siteId, products.externalId],
				set: {
					name: sql`excluded.name`,
					price: sql`excluded.price`,
					listPrice: sql`excluded.list_price`,
					imageUrl: sql`excluded.image_url`,
					url: sql`excluded.url`,
					categories: sql`excluded.categories`,
					brand: sql`excluded.brand`,
					rating: sql`excluded.rating`,
					reviewsCount: sql`excluded.reviews_count`,
					description: sql`excluded.description`,
					keywords: sql`(select array(select distinct unnest(${products.keywords} || excluded.keywords)))`,
					raw: sql`excluded.raw`,
					active: true,
					lastSeenAt: sql`now()`
				}
			});
	}

	await db
		.update(scrapeRuns)
		.set({ status: 'succeeded', productsFound: unique.length, finishedAt: new Date() })
		.where(eq(scrapeRuns.id, run.id));
	console.log(
		`${records.length} records (${records.length - rows.length} errors), ${unique.length} unique products stored`
	);
} else {
	console.log('usage: bun run amazon trigger|collect [runId]');
}

await db.$client.end();
