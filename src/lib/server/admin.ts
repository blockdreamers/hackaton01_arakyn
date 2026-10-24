import { error } from '@sveltejs/kit';
import type { User } from './db/schema.ts';

const ADMIN_EMAILS = new Set(['limkukhyun@gmail.com', 'nice00ricky@gmail.com']);

export const isAdmin = (user: User | null) => !!user && ADMIN_EMAILS.has(user.email.toLowerCase());

/** 404 for everyone else, so the admin pages don't reveal that they exist */
export function requireAdmin(user: User | null) {
	if (!isAdmin(user)) error(404, 'Not Found');
}
