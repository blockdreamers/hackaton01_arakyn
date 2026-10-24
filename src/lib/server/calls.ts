// Per-call history for the personal dashboard: one entry per lane per agent search.
// The teammate owns the database tables; until a table for this exists, entries are only
// written to the server log.

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
	console.info('[agent-call]', JSON.stringify({ ...entry, spec: undefined }));
}
