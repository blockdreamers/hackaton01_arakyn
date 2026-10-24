// Event stream for the token race. The simulated source replays plan estimates; the real backend
// (/api/race, two Claude agents running side by side) will push the same events over SSE.

import type { ScenarioId } from './search.ts';

export type Lane = 'web' | 'catalog';

export interface RaceEvent {
	lane: Lane;
	t: number;
	kind: 'tool' | 'usage' | 'verify' | 'pay' | 'answer' | 'done';
	label: string;
	inputTokens: number;
	outputTokens: number;
	tone?: 'ok' | 'bad' | 'pay';
}

export interface RaceSource {
	subscribe(cb: (e: RaceEvent) => void): () => void;
	start(): void;
	stop(): void;
}

// Claude Opus 5.5, USD per token
export const PRICE_IN = 4 / 1e6;
export const PRICE_OUT = 20 / 1e6;
export const DATA_FEE_USDC = 0.02;

export const costOf = (inputTokens: number, outputTokens: number) =>
	inputTokens * PRICE_IN + outputTokens * PRICE_OUT;

type Step = [
	t: number,
	kind: RaceEvent['kind'],
	label: string,
	inTok: number,
	outTok: number,
	tone?: RaceEvent['tone']
];

const WEB: Record<ScenarioId, Step[]> = {
	metal: [
		[0.6, 'tool', 'web_search "DIN912 M4x12 A2 bulk"', 1800, 120],
		[2.2, 'tool', 'web_fetch amazon.com search results', 52000, 380],
		[4.1, 'tool', 'web_fetch amazon.com/dp/… product page', 84000, 520],
		[6.3, 'tool', 'web_fetch s.taobao.com results (Chinese, heavy scripts)', 47000, 610],
		[8.6, 'tool', 'web_fetch item.taobao.com detail (per-option prices)', 66000, 700],
		[10.4, 'tool', 'web_search again: unit and MOQ notation differ', 1900, 240],
		[12.7, 'tool', 'web_fetch amazon.com/dp/… second candidate', 79000, 640],
		[14.8, 'answer', 'Answer written (includes unverified items)', 2400, 1650, 'bad']
	],
	plastic: [
		[0.6, 'tool', 'web_search "PA66 cable tie 3.6x200 UL94V-2 black"', 1700, 110],
		[2.4, 'tool', 'web_fetch amazon.com search results', 49000, 360],
		[4.5, 'tool', 'web_fetch amazon.com/dp/… (100-pack price)', 78000, 540],
		[6.8, 'tool', 'web_fetch s.taobao.com results', 51000, 600],
		[9.0, 'tool', 'web_fetch item.taobao.com detail (specs inside images)', 71000, 680],
		[11.3, 'tool', 'web_fetch manufacturer datasheet PDF', 18000, 420],
		[13.4, 'answer', 'Answer written (includes unverified items)', 2300, 1580, 'bad']
	],
	usbc: [
		[0.6, 'tool', 'web_search "USB-C 240W 1m e-marker bulk"', 1900, 120],
		[2.3, 'tool', 'web_fetch amazon.com search results', 55000, 390],
		[4.4, 'tool', 'web_fetch amazon.com/dp/… (100W product mixed in)', 88000, 560],
		[6.9, 'tool', 'web_fetch s.taobao.com results', 46000, 590],
		[9.1, 'tool', 'web_fetch item.taobao.com detail', 69000, 660],
		[11.0, 'tool', 'web_search again: confirm "240W EPR" notation', 1800, 230],
		[13.1, 'answer', 'Answer written (includes unverified items)', 2200, 1500, 'bad']
	],
	interior: [
		[0.6, 'tool', 'web_search "35mm soft close hinge full overlay 110"', 1800, 120],
		[2.3, 'tool', 'web_fetch amazon.com search results', 50000, 370],
		[4.4, 'tool', 'web_fetch amazon.com/dp/… product page', 82000, 530],
		[6.6, 'tool', 'web_fetch s.taobao.com results', 45000, 590],
		[8.9, 'tool', 'web_fetch item.taobao.com detail (overlay options mixed)', 68000, 650],
		[10.8, 'tool', 'web_search again: confirm "full overlay" option', 1800, 230],
		[12.9, 'answer', 'Answer written (includes unverified items)', 2200, 1480, 'bad']
	]
};

export const WEB_ERRORS: Record<ScenarioId, string[]> = {
	metal: [
		'Found 3 offers, but could not confirm A2 vs A4 on one page.',
		'Missed the ISO 4762 equivalent standard entirely.',
		'One price is a 100-pack price not divided per unit.'
	],
	plastic: [
		'No evidence for the UL94 V-2 rating on 2 offers.',
		'Mixed UV-resistant black ties with natural ones.',
		'One pack price was converted to per-unit incorrectly.'
	],
	usbc: [
		'One of the 3 cables is actually a 100 W cable.',
		'Listed a vendor with MOQ 500 as available for 100 pcs.'
	],
	interior: [
		'A half-overlay option price slipped in.',
		'Could not confirm soft-close on one offer.'
	]
};

function catalogSteps(call: string, txHash: string): Step[] {
	return [
		[0.5, 'tool', call.replace('search_offers', 'search_offers (free preview)'), 820, 140],
		[1.0, 'verify', 'Verify: 3 candidates match the requested spec', 160, 90, 'ok'],
		[1.4, 'pay', `402 Payment Required · ${DATA_FEE_USDC} USDC`, 0, 0, 'pay'],
		[1.9, 'pay', `x402 signed → settled tx ${txHash} (Base testnet)`, 120, 60, 'pay'],
		[2.4, 'tool', 'get_offers_full · data hash matches preview', 1180, 80, 'ok'],
		[2.9, 'answer', 'Answer written: comparison table, 3 rows', 260, 420, 'ok']
	];
}

export function simulatedSource(
	scenario: ScenarioId,
	call: string,
	txHash: string,
	speed = 1
): RaceSource {
	const subs = new Set<(e: RaceEvent) => void>();
	let timers: ReturnType<typeof setTimeout>[] = [];
	const emit = (e: RaceEvent) => subs.forEach((cb) => cb(e));
	const schedule = (lane: Lane, steps: Step[]) => {
		for (const [t, kind, label, inputTokens, outputTokens, tone] of steps) {
			timers.push(
				setTimeout(
					() => emit({ lane, t, kind, label, inputTokens, outputTokens, tone }),
					(t * 1000) / speed
				)
			);
		}
		const end = steps[steps.length - 1][0] + 0.2;
		timers.push(
			setTimeout(
				() => emit({ lane, t: end, kind: 'done', label: 'done', inputTokens: 0, outputTokens: 0 }),
				(end * 1000) / speed
			)
		);
	};
	return {
		subscribe(cb) {
			subs.add(cb);
			return () => subs.delete(cb);
		},
		start() {
			schedule('web', WEB[scenario]);
			schedule('catalog', catalogSteps(call, txHash));
		},
		stop() {
			timers.forEach(clearTimeout);
			timers = [];
		}
	};
}

// TODO: real backend. The API server will run both agents with the same model and prompt and push
// one RaceEvent per turn (usage taken from the API response) on /api/race?q=<scenario>.
export function sseSource(url: string): RaceSource {
	const subs = new Set<(e: RaceEvent) => void>();
	let es: EventSource | null = null;
	return {
		subscribe(cb) {
			subs.add(cb);
			return () => subs.delete(cb);
		},
		start() {
			es = new EventSource(url);
			es.onmessage = (m) => {
				const e = JSON.parse(m.data) as RaceEvent;
				subs.forEach((cb) => cb(e));
			};
		},
		stop() {
			es?.close();
			es = null;
		}
	};
}
