import { error, json } from '@sveltejs/kit';
import { monitorSearch } from '#lib/server/monitor.ts';
import type { RequestHandler } from './$types';

// Read-only traced keyword search for the data monitor (no LLM, no cost).
export const POST: RequestHandler = async ({ request }) => {
	const { q, terms } = (await request.json().catch(() => ({}))) as {
		q?: string;
		terms?: unknown;
	};
	if (!q?.trim()) error(400, 'q is required');
	const picked = Array.isArray(terms)
		? terms.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60))
		: undefined;
	return json(await monitorSearch(q.trim().slice(0, 200), picked));
};
