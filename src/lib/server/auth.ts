import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db';
import { sessions, users, type User } from './db/schema';

export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(cookies: Cookies, userId: number) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(sessions).values({ id: hash(token), userId, expiresAt });
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export async function getSessionUser(token: string): Promise<User | null> {
	const [row] = await db
		.select({ user: users, expiresAt: sessions.expiresAt })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, hash(token)));
	if (!row) return null;
	if (row.expiresAt < new Date()) {
		await db.delete(sessions).where(eq(sessions.id, hash(token)));
		return null;
	}
	return row.user;
}

export async function deleteSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(sessions).where(eq(sessions.id, hash(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
