import { json } from '@sveltejs/kit';
import { getTree } from '#lib/server/monitor.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await getTree());
