// Demo-only storage for data that has no database table yet (agent-search call history).
// JSON lines under data/runtime/ (gitignored). Swap for a real table once it exists.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data/runtime');

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
