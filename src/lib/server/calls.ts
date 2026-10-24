// Per-call history for the personal dashboard: one entry per lane per agent search.
// The teammate owns the database tables; until a table for this exists, entries go to the
// demo-only local store.
import { appendCall } from './local-store.ts';

export interface CallLogEntry {
	userId?: number | null;
	apiKeyId?: number | null;
	wallet?: string | null;
	source: 'widget' | 'api';
	mode: 'preset' | 'ai';
	query: string;
	spec: unknown;
	lane: 'catalog' | 'web';
	verifyResult: 'pass' | 'fail' | 'skipped';
	verifyDetail?: unknown;
	requestedAt: Date;
	receivedAt: Date;
	paidUsdc: number;
	paymentTx?: string | null;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
}

export async function logCall(entry: CallLogEntry): Promise<void> {
	try {
		await appendCall(entry);
	} catch (err) {
		console.error('logCall failed', err);
	}
}
