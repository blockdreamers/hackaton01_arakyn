// Agent search for the floating search dock. Streams Server-Sent Events:
// spec → steps from both lanes (catalog, web) → lane_done per lane → summary.
// Preset questions skip spec extraction and replay a cached real run when one exists.
import { error } from '@sveltejs/kit';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRESET_BY_ID, type PresetId } from '#lib/demo/presets.ts';
import { logCall } from '#lib/server/calls.ts';
import { recordSearch } from '#lib/server/stats.ts';
import { assertBudget, spentUsd } from '#lib/server/agent/budget.ts';
import { extractSpec } from '#lib/server/agent/extract.ts';
import { buyerQuestion, type Spec } from '#lib/server/agent/prompts.ts';
import { runCatalogLane } from '#lib/server/agent/catalog-lane.ts';
import { runWebLane } from '#lib/server/agent/web-lane.ts';
import type { AgentEvent, Lane } from '#lib/server/agent/events.ts';
import type { RequestHandler } from './$types';

const CACHE_DIR = join(process.cwd(), 'data/runtime/preset-cache');

interface Body {
	mode: 'preset' | 'ai';
	presetId?: PresetId;
	query?: string;
	lanes?: Lane[];
	fresh?: boolean;
}

interface CachedRun {
	events: { at: number; event: AgentEvent }[];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json()) as Body;
	const lanes = (body.lanes?.length ? body.lanes : ['catalog', 'web']).filter(
		(l) => l === 'catalog' || l === 'web'
	);
	let query: string;
	let presetId: PresetId | null = null;
	if (body.mode === 'preset') {
		if (!body.presetId || !(body.presetId in PRESET_BY_ID)) error(400, 'unknown preset');
		presetId = body.presetId;
		query = PRESET_BY_ID[presetId].question;
	} else {
		query = (body.query ?? '').trim().slice(0, 500);
		if (!query) error(400, 'empty query');
	}
	const userId = locals.user?.id ?? null;
	const cacheFile = presetId
		? join(CACHE_DIR, `${presetId}-${[...lanes].sort().join('+')}.json`)
		: null;

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();
			const send = (e: AgentEvent) =>
				controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
			try {
				await recordSearch();

				// Replay a recorded real run for preset questions (no API cost).
				if (cacheFile && !body.fresh) {
					const cached = await readFile(cacheFile, 'utf8')
						.then((s) => JSON.parse(s) as CachedRun)
						.catch(() => null);
					if (cached) {
						const start = Date.now();
						for (const { at, event } of cached.events) {
							const wait = at - (Date.now() - start);
							if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 4000)));
							send(
								event.type === 'step' && event.label.startsWith('code_execution {')
									? { ...event, label: 'code_execution (filtering search results)' }
									: event.type === 'summary'
										? { ...event, replayed: true, spentUsd: await spentUsd() }
										: event
							);
						}
						controller.close();
						return;
					}
				}

				await assertBudget();
				const recorded: CachedRun['events'] = [];
				const t0 = Date.now();
				const emit = (e: AgentEvent) => {
					recorded.push({ at: Date.now() - t0, event: e });
					send(e);
				};

				let spec: Spec;
				if (presetId) {
					spec = PRESET_BY_ID[presetId].spec;
					emit({ type: 'spec', spec, inputTokens: 0, outputTokens: 0, costUsd: 0 });
				} else {
					const x = await extractSpec(query);
					spec = x.spec;
					emit({ type: 'spec', spec, ...x.usage });
				}
				if (spec.search_terms_ko.length + spec.search_terms_en.length === 0) {
					emit({ type: 'summary', ratio: null, spentUsd: await spentUsd(), replayed: false });
					controller.close();
					return;
				}

				const question = buyerQuestion(query, spec);
				const requestedAt = new Date();
				const totals: Partial<Record<Lane, number>> = {};

				const catalog = lanes.includes('catalog')
					? runCatalogLane(question, spec, emit).then(async (r) => {
							totals.catalog = r.input;
							emit({
								type: 'lane_done',
								lane: 'catalog',
								answer: r.answer,
								results: r.results,
								inputTokens: r.input,
								outputTokens: r.output,
								costUsd: r.cost,
								calls: r.calls,
								t: r.t,
								verify: r.verify,
								paymentUrl: r.payment?.url ?? null
							});
							await logCall({
								userId,
								source: 'widget',
								mode: body.mode,
								query,
								spec,
								lane: 'catalog',
								verifyResult: r.verify,
								verifyDetail: { dataHash: r.dataHash, results: r.results },
								requestedAt,
								receivedAt: new Date(),
								paidUsdc: r.payment?.ok ? 0.02 : 0,
								paymentTx: r.payment?.tx ?? null,
								inputTokens: r.input,
								outputTokens: r.output,
								costUsd: r.cost
							});
						})
					: Promise.resolve();
				const web = lanes.includes('web')
					? runWebLane(question, emit).then(async (r) => {
							totals.web = r.input;
							emit({
								type: 'lane_done',
								lane: 'web',
								answer: r.answer,
								inputTokens: r.input,
								outputTokens: r.output,
								costUsd: r.cost,
								calls: r.calls,
								t: r.t,
								verify: 'skipped',
								aborted: r.aborted
							});
							await logCall({
								userId,
								source: 'widget',
								mode: body.mode,
								query,
								spec,
								lane: 'web',
								verifyResult: 'skipped',
								requestedAt,
								receivedAt: new Date(),
								paidUsdc: 0,
								inputTokens: r.input,
								outputTokens: r.output,
								costUsd: r.cost
							});
						})
					: Promise.resolve();

				const settled = await Promise.allSettled([catalog, web]);
				for (const s of settled)
					if (s.status === 'rejected')
						emit({ type: 'error', message: String(s.reason?.message ?? s.reason) });

				const ratio =
					totals.web && totals.catalog ? +(totals.web / totals.catalog).toFixed(1) : null;
				emit({ type: 'summary', ratio, spentUsd: await spentUsd(), replayed: false });

				if (cacheFile && settled.every((s) => s.status === 'fulfilled')) {
					await mkdir(CACHE_DIR, { recursive: true });
					await writeFile(cacheFile, JSON.stringify({ events: recorded } satisfies CachedRun));
				}
			} catch (e) {
				send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
			}
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};

export const GET: RequestHandler = async () =>
	new Response(JSON.stringify({ spentUsd: await spentUsd() }), {
		headers: { 'content-type': 'application/json' }
	});
