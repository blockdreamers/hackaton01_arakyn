import { error, json } from '@sveltejs/kit';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID } from '$app/env/public';
import { db } from '#lib/server/db/index.ts';
import { users } from '#lib/server/db/schema.ts';
import { createSession } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

const client = new OAuth2Client();

// Receives the ID token (credential) from Google Identity Services
export const POST: RequestHandler = async ({ request, cookies }) => {
	const { credential } = await request.json();
	if (typeof credential !== 'string') error(400, 'Missing credential');

	const payload = await client
		.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })
		.then((ticket) => ticket.getPayload())
		.catch(() => undefined);
	if (!payload?.sub || !payload.email) error(401, 'Invalid Google credential');

	const profile = { email: payload.email, name: payload.name, picture: payload.picture };
	const [user] = await db
		.insert(users)
		.values({ googleSub: payload.sub, ...profile })
		.onConflictDoUpdate({ target: users.googleSub, set: profile })
		.returning();

	await createSession(cookies, user.id);
	return json({ ok: true });
};
