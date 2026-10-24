// Site monitor: policy, parser and scrape-status checks, summarized by a Claude agent.
//   bun run monitor [--sites iaansci,navimro]   agent report (needs ANTHROPIC_API_KEY)
//   bun run monitor --checks-only [--sites …]   run the checks without the agent
import { parseArgs } from 'node:util';
import { createDb } from '../src/lib/server/db/client.ts';
import { checkParser, checkPolicy, scrapeStatus } from '../src/lib/server/monitor/checks.ts';
import { runMonitorAgent } from '../src/lib/server/monitor/agent.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { values } = parseArgs({
	options: { sites: { type: 'string' }, 'checks-only': { type: 'boolean', default: false } }
});
const sites = values.sites?.split(',').map((s) => s.trim());
const db = createDb(url, { max: 2 });

if (values['checks-only']) {
	for (const site of sites ?? []) {
		console.log(JSON.stringify(await checkPolicy(db, site), null, 1));
		console.log(JSON.stringify(await checkParser(db, site), null, 1));
	}
	console.log(JSON.stringify(await scrapeStatus(db), null, 1));
} else {
	const result = await runMonitorAgent(db, { sites });
	console.log(result.report);
	console.log(`\n(report #${result.id}, ${result.model}, ${JSON.stringify(result.usage)})`);
}
await db.$client.end();
