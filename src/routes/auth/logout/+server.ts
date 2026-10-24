import { redirect } from '@sveltejs/kit';
import { deleteSession } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	await deleteSession(cookies);
	redirect(303, '/');
};
