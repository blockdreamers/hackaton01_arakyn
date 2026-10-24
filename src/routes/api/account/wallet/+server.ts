import { error, json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { verifyMessage } from 'viem';
import { db } from '#lib/server/db/index.ts';
import { wallets } from '#lib/server/db/schema.ts';
import { isMissingTable } from '#lib/server/apikeys.ts';
import type { RequestHandler } from './$types';

const NONCE_COOKIE = 'wallet_nonce';

const message = (address: string, nonce: string) =>
	`Agent Catalog: connect this wallet as my agent wallet.\n\nAddress: ${address}\nChain: Base Sepolia\nNonce: ${nonce}`;

// Step 1: the browser asks for a message to sign; the nonce lives in an httpOnly cookie.
export const GET: RequestHandler = ({ locals, url, cookies }) => {
	if (!locals.user) error(401);
	const address = (url.searchParams.get('address') ?? '').toLowerCase();
	if (!/^0x[0-9a-f]{40}$/.test(address)) error(400, 'Invalid address');
	const nonce = randomBytes(16).toString('hex');
	cookies.set(NONCE_COOKIE, `${address}:${nonce}`, {
		path: '/api/account/wallet',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: 300
	});
	return json({ message: message(address, nonce) });
};

// Step 2: verify the personal_sign signature and store the wallet.
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.user) error(401);
	const { address, signature } = await request.json();
	const [addr, nonce] = (cookies.get(NONCE_COOKIE) ?? '').split(':');
	cookies.delete(NONCE_COOKIE, { path: '/api/account/wallet' });
	if (!nonce || typeof address !== 'string' || address.toLowerCase() !== addr)
		error(400, 'Nonce expired');
	const ok = await verifyMessage({
		address: address as `0x${string}`,
		message: message(addr, nonce),
		signature
	}).catch(() => false);
	if (!ok) error(400, 'Signature does not match the address');
	try {
		await db
			.insert(wallets)
			.values({ userId: locals.user.id, address: addr, verifiedAt: new Date() })
			.onConflictDoUpdate({
				target: [wallets.userId, wallets.address],
				set: { verifiedAt: new Date() }
			});
	} catch (err) {
		if (isMissingTable(err)) error(503, 'Account tables are not migrated yet');
		throw err;
	}
	return json({ ok: true, address: addr });
};
