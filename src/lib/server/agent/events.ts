export type Lane = 'catalog' | 'web';

export type AgentEvent =
	| {
			type: 'spec';
			spec: unknown;
			inputTokens: number;
			outputTokens: number;
			costUsd: number;
			cached?: boolean;
	  }
	| {
			type: 'step';
			lane: Lane;
			kind: 'tool' | 'usage' | 'verify' | 'pay' | 'answer' | 'error';
			label: string;
			inputTokens: number;
			outputTokens: number;
			t: number;
			tone?: 'ok' | 'bad' | 'pay';
			url?: string;
	  }
	| {
			type: 'lane_done';
			lane: Lane;
			answer: string;
			results?: unknown[];
			inputTokens: number;
			outputTokens: number;
			costUsd: number;
			calls: number;
			t: number;
			verify?: 'pass' | 'fail' | 'skipped';
			aborted?: string;
			paymentUrl?: string | null;
	  }
	| { type: 'summary'; ratio: number | null; spentUsd: number; replayed: boolean }
	| { type: 'error'; message: string };

export type Emit = (e: AgentEvent) => void;
