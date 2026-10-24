// Search engine over the sample catalog that records a per-row trace, so the monitor screen can
// replay what the engine actually evaluated (the real query takes a few ms, too fast to see).

import {
	CATEGORIES,
	EQUIVALENT,
	OFFERS,
	PRODUCTS,
	PRODUCT_BY_ID,
	VENDOR_BY_ID,
	fnv,
	type CategoryId,
	type Offer,
	type Product
} from './catalog.ts';

export type ScenarioId = 'metal' | 'plastic' | 'usbc' | 'interior';

export interface Scenario {
	id: ScenarioId;
	label: string;
	category: CategoryId;
	question: string;
	qty: number;
	shipTo: string;
	call: string;
	specNote: string;
	match: (p: Product) => MatchResult;
}

interface MatchResult {
	ok: boolean;
	reason?: string;
	equivalent?: string;
}

const eq = (a: unknown, b: unknown, field: string) =>
	a === b ? null : `${field} ${String(a)} ≠ ${String(b)}`;

function check(p: Product, rules: [string, unknown][]): MatchResult {
	for (const [field, want] of rules) {
		const miss = eq(p.specs[field], want, field);
		if (miss) return { ok: false, reason: miss };
	}
	return { ok: true };
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
	metal: {
		id: 'metal',
		label: 'Metal · socket screw',
		category: 'fastener',
		question:
			'M4×12 stainless socket head cap screw (DIN 912, A2-70), 500 pcs, ship to Korea. Cheapest 3 per-unit offers.',
		qty: 500,
		shipTo: 'KR',
		call: 'search_offers(standard="DIN 912", thread="M4", length_mm=12, material="A2-70", qty=500, ship_to="KR")',
		specNote: 'DIN 912 ≈ ISO 4762 · M4×12 · A2-70',
		match: (p) => {
			const stds = ['DIN 912', ...(EQUIVALENT['DIN 912'] ?? [])];
			if (!stds.includes(p.standard)) return { ok: false, reason: `standard ${p.standard}` };
			const r = check(p, [
				['thread', 'M4'],
				['length_mm', 12],
				['material', 'A2-70']
			]);
			return p.standard === 'DIN 912' || !r.ok ? r : { ...r, equivalent: 'DIN 912' };
		}
	},
	plastic: {
		id: 'plastic',
		label: 'Plastic · cable tie',
		category: 'plastic',
		question:
			'PA66 nylon cable tie 3.6×200 mm, UL94 V-2, black UV-resistant, 5,000 pcs. Cheapest 3 per-unit offers.',
		qty: 5000,
		shipTo: 'KR',
		call: 'search_offers(material="PA66", size="3.6x200", ul94="V-2", uv=true, qty=5000, ship_to="KR")',
		specNote: 'PA66 · 3.6×200 · UL94 V-2 · UV',
		match: (p) =>
			check(p, [
				['material', 'PA66'],
				['size', '3.6x200'],
				['ul94', 'V-2'],
				['uv', true]
			])
	},
	usbc: {
		id: 'usbc',
		label: 'Electronics · USB-C',
		category: 'usbc',
		question:
			'USB-C to C cable, 1 m, 240 W (EPR) with e-marker, 100 pcs. Cheapest 3 per-unit offers.',
		qty: 100,
		shipTo: 'KR',
		call: 'search_offers(type="C-C", length_m=1, max_watt>=240, qty=100, ship_to="KR")',
		specNote: 'C-C · 1 m · ≥240 W',
		match: (p) => {
			const r = check(p, [
				['type', 'C-C'],
				['length_m', 1]
			]);
			if (!r.ok) return r;
			return Number(p.specs.max_watt) >= 240
				? { ok: true }
				: { ok: false, reason: `max_watt ${p.specs.max_watt} < 240` };
		}
	},
	interior: {
		id: 'interior',
		label: 'Interior · cup hinge',
		category: 'interior',
		question:
			'35 mm cup hinge, soft-close, 110°, full overlay, 200 pcs. Cheapest 3 per-unit offers.',
		qty: 200,
		shipTo: 'KR',
		call: 'search_offers(type="cup_hinge", cup_mm=35, soft_close=true, angle=110, overlay="full", qty=200, ship_to="KR")',
		specNote: '35 mm · soft-close · 110° · full overlay',
		match: (p) =>
			p.family !== 'cup-hinge'
				? { ok: false, reason: `family ${p.family}` }
				: check(p, [
						['cup_mm', 35],
						['soft_close', true],
						['angle', 110],
						['overlay', 'full']
					])
	}
};

// Free-text questions map onto one of the four demo categories; anything else is "not in catalog".
export function resolveScenario(text: string): ScenarioId | null {
	const t = text.toLowerCase();
	if (/(din|iso|bolt|screw|볼트|나사|m[3-8]\b|fastener|nut|너트)/.test(t)) return 'metal';
	if (/(cable ?tie|케이블타이|pa66|nylon|ul94|spacer|bushing)/.test(t)) return 'plastic';
	if (/(usb|type-?c|240 ?w|e-?marker|케이블)/.test(t)) return 'usbc';
	if (/(hinge|경첩|drawer|rail|led|strip|interior)/.test(t)) return 'interior';
	return null;
}

export type TraceStage = 'category' | 'spec' | 'offer' | 'rank' | 'verify';
export type TraceResult = 'match' | 'skip' | 'drop' | 'keep' | 'pass' | 'fail';

export interface TraceStep {
	stage: TraceStage;
	rowId: string;
	result: TraceResult;
	reason?: string;
	rank?: number;
	field?: string;
}

export interface VerifyRow {
	offerId: string;
	checks: { field: string; label: string; ok: boolean; detail: string }[];
}

export interface SearchRun {
	scenario: Scenario;
	trace: TraceStep[];
	counts: { stage: string; note: string; rows: number }[];
	skippedByIndex: number;
	matchedProducts: string[];
	top: Offer[];
	verify: VerifyRow[];
	approved: boolean;
	realMs: number;
	previewHash: string;
	response: unknown;
}

export interface SearchOptions {
	maxAgeH?: number;
}

export function runSearch(id: ScenarioId, opts: SearchOptions = {}): SearchRun {
	const s = SCENARIOS[id];
	const t0 = performance.now();
	const trace: TraceStep[] = [];

	let skipped = 0;
	for (const c of CATEGORIES) {
		const hit = c.id === s.category;
		trace.push({ stage: 'category', rowId: `cat:${c.id}`, result: hit ? 'match' : 'skip' });
		if (!hit) skipped += OFFERS.filter((o) => PRODUCT_BY_ID[o.productId].category === c.id).length;
	}

	const inCat = PRODUCTS.filter((p) => p.category === s.category);
	const matched: Product[] = [];
	for (const p of inCat) {
		const r = s.match(p);
		trace.push({
			stage: 'spec',
			rowId: p.id,
			result: r.ok ? 'match' : 'skip',
			reason: r.ok ? r.equivalent && `≈ ${r.equivalent}` : r.reason
		});
		if (r.ok) matched.push(p);
	}

	const candidates = OFFERS.filter((o) => matched.some((p) => p.id === o.productId));
	const kept: Offer[] = [];
	for (const o of candidates) {
		let reason: string | undefined;
		if (!o.shipsTo.includes(s.shipTo)) reason = `✗ no ${s.shipTo} shipping`;
		else if (o.moq > s.qty) reason = `✗ MOQ ${o.moq.toLocaleString()} > ${s.qty.toLocaleString()}`;
		trace.push({ stage: 'offer', rowId: o.id, result: reason ? 'drop' : 'keep', reason });
		if (!reason) kept.push(o);
	}

	const top = kept.sort((a, b) => a.unitPriceUsd - b.unitPriceUsd).slice(0, 3);
	top.forEach((o, i) => trace.push({ stage: 'rank', rowId: o.id, result: 'match', rank: i + 1 }));

	const verify: VerifyRow[] = top.map((o) => {
		const p = PRODUCT_BY_ID[o.productId];
		const fresh = opts.maxAgeH == null || o.fetchedHoursAgo <= opts.maxAgeH;
		return {
			offerId: o.id,
			checks: [
				{ field: 'spec', label: 'Spec match', ok: true, detail: s.specNote },
				{
					field: 'standard',
					label: 'Equivalent std',
					ok: true,
					detail: p.standard === 'ISO 4762' ? 'ISO 4762 = DIN 912' : p.standard
				},
				{
					field: 'ship',
					label: `Ships to ${s.shipTo}`,
					ok: o.shipsTo.includes(s.shipTo),
					detail: o.shipsTo.join(',')
				},
				{ field: 'moq', label: 'MOQ ≤ qty', ok: o.moq <= s.qty, detail: `${o.moq} ≤ ${s.qty}` },
				{
					field: 'fresh',
					label: opts.maxAgeH ? `Fetched ≤ ${opts.maxAgeH}h` : 'Fetched time',
					ok: fresh,
					detail: `${o.fetchedHoursAgo}h ago`
				}
			]
		};
	});
	for (const v of verify) {
		for (const c of v.checks) {
			trace.push({
				stage: 'verify',
				rowId: v.offerId,
				result: c.ok ? 'pass' : 'fail',
				field: c.field
			});
		}
	}
	const approved = verify.length > 0 && verify.every((v) => v.checks.every((c) => c.ok));
	const realMs = performance.now() - t0;

	const previewHash = '0x' + fnv(top.map((o) => o.dataHash).join('|'));
	const response = {
		query: s.call,
		results: top.map((o) => ({
			product: PRODUCT_BY_ID[o.productId].name,
			standard: PRODUCT_BY_ID[o.productId].standard,
			vendor: VENDOR_BY_ID[o.vendorId].name,
			unit_price_usd: o.unitPriceUsd,
			moq: o.moq,
			lead_time_days: o.leadTimeDays,
			total_usd: +(o.unitPriceUsd * s.qty).toFixed(2),
			fetched_hours_ago: o.fetchedHoursAgo,
			data_hash: o.dataHash
		})),
		data_hash: previewHash,
		price_usdc: 0.02
	};

	return {
		scenario: s,
		trace,
		counts: [
			{ stage: 'Indexed offers', note: 'sample DB', rows: OFFERS.length },
			{ stage: 'Category', note: s.category, rows: OFFERS.length - skipped },
			{ stage: 'Spec match', note: s.specNote, rows: candidates.length },
			{
				stage: 'Ship + MOQ',
				note: `${s.shipTo} · qty ${s.qty.toLocaleString()}`,
				rows: kept.length
			},
			{ stage: 'Ranked', note: 'unit price · top 3', rows: top.length }
		],
		skippedByIndex: skipped,
		matchedProducts: matched.map((p) => p.id),
		top,
		verify,
		approved,
		realMs,
		previewHash,
		response
	};
}
