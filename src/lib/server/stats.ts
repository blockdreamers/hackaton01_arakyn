// Search counter shown on the landing page. Kept in a small JSON file until the catalog moves into
// the database; data/runtime/ is gitignored.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'data/runtime/stats.json');

let searches: number | null = null;
let writing = Promise.resolve();

async function load() {
	if (searches !== null) return searches;
	try {
		searches = JSON.parse(await readFile(FILE, 'utf8')).searches ?? 0;
	} catch {
		searches = 0;
	}
	return searches!;
}

export async function getSearchCount() {
	return load();
}

export async function recordSearch() {
	const n = (await load()) + 1;
	searches = n;
	writing = writing.then(async () => {
		await mkdir(join(process.cwd(), 'data/runtime'), { recursive: true });
		await writeFile(FILE, JSON.stringify({ searches }));
	});
	await writing;
	return n;
}
