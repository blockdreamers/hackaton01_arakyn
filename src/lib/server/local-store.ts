// Demo-only storage for data that has no database table yet (agent wallets, agent-search call
// history). JSON files under data/runtime/ (gitignored). Swap for real tables once they exist.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data/runtime');

async function readJson<T>(name: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(join(DIR, name), 'utf8')) as T;
	} catch {
		return fallback;
	}
}

export interface StoredWallet {
	id: number;
	userId: number;
	address: string;
	chain: string;
	verifiedAt: string;
	createdAt: string;
}

export async function listWallets(userId: number) {
	return (await readJson<StoredWallet[]>('wallets.json', [])).filter((w) => w.userId === userId);
}

export async function saveWallet(userId: number, address: string) {
	const all = await readJson<StoredWallet[]>('wallets.json', []);
	const now = new Date().toISOString();
	const existing = all.find((w) => w.userId === userId && w.address === address);
	if (existing) existing.verifiedAt = now;
	else
		all.push({
			id: Math.max(0, ...all.map((w) => w.id)) + 1,
			userId,
			address,
			chain: 'base-sepolia',
			verifiedAt: now,
			createdAt: now
		});
	await mkdir(DIR, { recursive: true });
	await writeFile(join(DIR, 'wallets.json'), JSON.stringify(all, null, 1));
}

export async function removeWallet(userId: number, id: number) {
	const all = await readJson<StoredWallet[]>('wallets.json', []);
	await writeFile(
		join(DIR, 'wallets.json'),
		JSON.stringify(all.filter((w) => !(w.userId === userId && w.id === id)))
	);
}

export async function appendCall(entry: object) {
	await mkdir(DIR, { recursive: true });
	await appendFile(join(DIR, 'calls.jsonl'), JSON.stringify(entry) + '\n');
}

export async function readCalls(): Promise<Record<string, unknown>[]> {
	try {
		return (await readFile(join(DIR, 'calls.jsonl'), 'utf8'))
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}
