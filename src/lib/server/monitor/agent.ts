import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import { monitorReports } from '../db/schema.ts';
import { checkParser, checkPolicy, scrapeStatus, siteCodes } from './checks.ts';

export const MONITOR_MODEL = 'claude-opus-5-5';

const SYSTEM = `You monitor the product scrapers of Agent Catalog (agent-catalog.techtree.kr).
Each site is scraped politely with the User-Agent "AgentCatalogBot"; we only fetch robots.txt-allowed
URLs and never evade bot protection.

Your job, using only the tools:
1. Policy: has robots.txt changed in a way that affects us, do any URLs we fetch fall under a
   Disallow rule, does the site now block AI crawlers entirely, is our delay below its crawl-delay,
   is there a bot challenge or block (403, captcha)?
2. Site updates: does the parser still extract products (item count, missing name/price/image),
   did the category count change notably versus the previous check?
3. Scrape status: failed runs, runs that look stalled, sites whose data is getting old.

Check every site you are asked about. Policy and parser checks make real requests to the shop, so
call each at most once per site. Call get_scrape_status once.

Then write the report in Korean, in Markdown:
- 한 줄 요약
- 사이트별 표: 사이트 | 정책 | 파서 | 수집 상태 | 조치 필요 (OK / 주의 / 위험)
- 주의·위험 항목마다 근거(도구 결과의 구체적 수치나 규칙)와 권장 조치
State only what the tool results show. If a check errored or was skipped, say so; do not guess.
A policy problem (newly disallowed path, AI-crawler block, bot challenge) means the recommended
action is to pause that site, not to work around it.`;

export async function runMonitorAgent(
	db: Db,
	options: { sites?: string[]; log?: (s: string) => void } = {}
) {
	const log = options.log ?? console.log;
	const known = siteCodes();
	const targets = options.sites?.length ? options.sites : known;
	const siteEnum = z.enum(known as [string, ...string[]]);
	const asJson = (v: unknown) => JSON.stringify(v, null, 1);

	const tools = [
		betaZodTool({
			name: 'list_sites',
			description: 'List the site codes that have scrapers.',
			inputSchema: z.object({}),
			run: async () => asJson(known)
		}),
		betaZodTool({
			name: 'check_site_policy',
			description:
				"Fetch the site's robots.txt and home page. Returns our applicable rules, changes since the last check, URLs we use that are now disallowed, AI-crawler blocks, crawl-delay vs our delay, and bot-challenge signs.",
			inputSchema: z.object({ site: siteEnum }),
			run: async ({ site }) => {
				log(`  policy check: ${site}`);
				return asJson(await checkPolicy(db, site));
			}
		}),
		betaZodTool({
			name: 'check_site_parser',
			description:
				"Run the site's real scraper on its first category, first page only. Returns category count (and the previous one), parsed item count, missing-field counts and rates, stored-data rates for comparison, and any error.",
			inputSchema: z.object({ site: siteEnum }),
			run: async ({ site }) => {
				log(`  parser check: ${site}`);
				return asJson(await checkParser(db, site));
			}
		}),
		betaZodTool({
			name: 'get_scrape_status',
			description:
				'Read scrape run history from the database for every site: last run, failures, running runs and minutes since their last progress, last success, product counts.',
			inputSchema: z.object({}),
			run: async () => {
				log('  scrape status');
				return asJson(await scrapeStatus(db));
			}
		})
	];

	const client = new Anthropic();
	const runner = client.beta.messages.toolRunner({
		model: MONITOR_MODEL,
		max_tokens: 16000,
		output_config: { effort: 'medium' },
		// on a safety decline, the API re-runs the request on a fallback model it picks
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		max_iterations: 3 * targets.length + 6,
		system: SYSTEM,
		tools,
		messages: [{ role: 'user', content: `Check these sites: ${targets.join(', ')}.` }]
	});

	const usage = { input_tokens: 0, output_tokens: 0, turns: 0 };
	for await (const message of runner) {
		usage.input_tokens += message.usage.input_tokens;
		usage.output_tokens += message.usage.output_tokens;
		usage.turns++;
	}
	const final = await runner.done();
	if (final.stop_reason === 'refusal') throw new Error('The model declined to write the report');
	if (final.stop_reason === 'max_tokens') throw new Error('Report was cut off (max_tokens)');

	const report = final.content
		.flatMap((b) => (b.type === 'text' ? [b.text] : []))
		.join('\n')
		.trim();
	if (!report) throw new Error(`No report text (stop_reason: ${final.stop_reason})`);

	const [row] = await db
		.insert(monitorReports)
		.values({ model: final.model, report, usage })
		.returning({ id: monitorReports.id });
	return { id: row.id, report, usage, model: final.model };
}
