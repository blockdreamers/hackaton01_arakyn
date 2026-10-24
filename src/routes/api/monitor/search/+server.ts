import { error, json } from '@sveltejs/kit';
import { monitorSearch } from '#lib/server/monitor.ts';
import type { RequestHandler } from './$types';

// Read-only traced keyword search for the data monitor (no LLM, no cost).
export const POST: RequestHandler = async ({ request }) => {
	const { q } = (await request.json().catch(() => ({}))) as { q?: string };
	if (!q?.trim()) error(400, 'q is required');
	return json(await monitorSearch(q.trim().slice(0, 200)));
};
