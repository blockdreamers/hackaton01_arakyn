// Sample catalog used by the demo screens until the real collected DB is wired in.
// Shape follows the plan's tables (Category, Product, Standard, Vendor, Offer, SourceSnapshot).
// Everything is generated deterministically so the tree and search traces look the same on every load.

export type CategoryId = 'fastener' | 'plastic' | 'usbc' | 'interior';

export interface Category {
	id: CategoryId;
	name: string;
	label: string;
	specFields: string[];
}

export interface Product {
	id: string;
	category: CategoryId;
	standard: string;
	family: string;
	name: string;
	specs: Record<string, string | number | boolean>;
}

export interface Vendor {
	id: string;
	name: string;
	channel: 'API' | 'feed' | 'sample';
	country: string;
}

export interface Offer {
	id: string;
	productId: string;
	vendorId: string;
	unitPriceUsd: number;
	moq: number;
	leadTimeDays: number;
	shipsTo: string[];
	fetchedHoursAgo: number;
	sourceUrl: string;
	rawTokens: number;
	cleanTokens: number;
	dataHash: string;
}

export const CATEGORIES: Category[] = [
	{
		id: 'fastener',
		name: 'fastener',
		label: 'Metal fasteners',
		specFields: ['standard', 'thread', 'length_mm', 'material']
	},
	{
		id: 'plastic',
		name: 'plastic',
		label: 'Plastic parts',
		specFields: ['material', 'size', 'ul94', 'uv']
	},
	{
		id: 'usbc',
		name: 'usb-c',
		label: 'USB-C cables',
		specFields: ['length_m', 'max_watt', 'usb_gen', 'emarker']
	},
	{
		id: 'interior',
		name: 'interior',
		label: 'Interior hardware',
		specFields: ['cup_mm', 'soft_close', 'overlay', 'voltage', 'cct']
	}
];

export const EQUIVALENT: Record<string, string[]> = {
	'DIN 912': ['ISO 4762'],
	'ISO 4762': ['DIN 912'],
	'DIN 934': ['ISO 4032'],
	'ISO 4032': ['DIN 934'],
	'DIN 125': ['ISO 7089'],
	'ISO 7089': ['DIN 125']
};

export const VENDORS: Vendor[] = [
	{ id: 'taobao', name: 'Taobao', channel: 'sample', country: 'CN' },
	{ id: 'alibaba', name: 'Alibaba', channel: 'sample', country: 'CN' },
	{ id: '1688', name: '1688', channel: 'sample', country: 'CN' },
	{ id: 'aliexpress', name: 'AliExpress', channel: 'sample', country: 'CN' },
	{ id: 'amazon', name: 'Amazon', channel: 'API', country: 'US' },
	{ id: 'mcmaster', name: 'McMaster-Carr', channel: 'feed', country: 'US' },
	{ id: 'misumi', name: 'Misumi', channel: 'feed', country: 'JP' }
];

const VENDOR_DOMAIN: Record<string, string> = {
	taobao: 'item.taobao.com',
	alibaba: 'alibaba.com',
	'1688': 'detail.1688.com',
	aliexpress: 'aliexpress.com',
	amazon: 'amazon.com',
	mcmaster: 'mcmaster.com',
	misumi: 'misumi-ec.com'
};

// price multiplier, typical MOQ, lead days, ships to KR
const VENDOR_PROFILE: Record<string, [number, number[], number, boolean]> = {
	taobao: [1, [100, 500, 1000], 9, true],
	alibaba: [0.95, [500, 1000, 5000], 13, true],
	'1688': [0.7, [1000, 5000, 50000], 16, false],
	aliexpress: [1.3, [10, 50, 100], 11, true],
	amazon: [4.2, [1, 10, 100], 4, true],
	mcmaster: [6, [1, 25, 50], 6, true],
	misumi: [2.1, [1, 20, 100], 6, true]
};

function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function fnv(str: string) {
	let h = 2166136261;
	for (const c of str) {
		h ^= c.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

function buildProducts(): Product[] {
	const out: Product[] = [];
	const add = (p: Omit<Product, 'id'>, id: string) => out.push({ id, ...p });

	// fasteners: 40
	const socket = [
		['M3', 8],
		['M3', 10],
		['M4', 10],
		['M4', 12],
		['M4', 16],
		['M5', 12],
		['M5', 16],
		['M6', 16],
		['M6', 20]
	] as const;
	for (const [thread, len] of socket) {
		for (const material of ['A2-70', 'A4-70']) {
			add(
				{
					category: 'fastener',
					standard: 'DIN 912',
					family: 'socket-cap',
					name: `${thread}x${len}-${material}`,
					specs: { thread, length_mm: len, material }
				},
				`fs-912-${thread}x${len}-${material}`.toLowerCase()
			);
		}
	}
	for (const [thread, len] of [
		['M4', 12],
		['M5', 16],
		['M6', 20]
	] as const) {
		add(
			{
				category: 'fastener',
				standard: 'ISO 4762',
				family: 'socket-cap',
				name: `${thread}x${len}-A2-70`,
				specs: { thread, length_mm: len, material: 'A2-70' }
			},
			`fs-4762-${thread}x${len}-a2-70`.toLowerCase()
		);
	}
	for (const thread of ['M3', 'M4', 'M5', 'M6', 'M8']) {
		for (const material of ['A2-70', '8-zinc']) {
			add(
				{
					category: 'fastener',
					standard: 'DIN 934',
					family: 'hex-nut',
					name: `${thread}-${material}`,
					specs: { thread, material }
				},
				`fs-934-${thread}-${material}`.toLowerCase()
			);
		}
	}
	for (const thread of ['M3', 'M4', 'M5', 'M6', 'M8']) {
		add(
			{
				category: 'fastener',
				standard: 'DIN 125',
				family: 'washer',
				name: `${thread}-A2`,
				specs: { thread, material: 'A2' }
			},
			`fs-125-${thread}-a2`.toLowerCase()
		);
	}
	// 18 + 3 + 10 + 5 = 36, top up with ISO nuts
	for (const thread of ['M4', 'M5', 'M6', 'M8']) {
		add(
			{
				category: 'fastener',
				standard: 'ISO 4032',
				family: 'hex-nut',
				name: `${thread}-A2-70`,
				specs: { thread, material: 'A2-70' }
			},
			`fs-4032-${thread}-a2-70`.toLowerCase()
		);
	}

	// plastic: 30
	for (const size of ['2.5x100', '3.6x150', '3.6x200', '4.8x200', '4.8x300', '7.6x370']) {
		for (const [color, uv] of [
			['black', true],
			['natural', false]
		] as const) {
			add(
				{
					category: 'plastic',
					standard: 'UL94 V-2',
					family: 'cable-tie',
					name: `PA66-${size}-${color}`,
					specs: { material: 'PA66', size, ul94: 'V-2', uv }
				},
				`pl-ct-${size}-${color}`
			);
		}
	}
	for (const size of ['M3x5', 'M3x8', 'M3x10', 'M4x10', 'M4x15', 'M4x20']) {
		for (const material of ['PA66', 'POM']) {
			add(
				{
					category: 'plastic',
					standard: material === 'PA66' ? 'UL94 V-2' : 'UL94 HB',
					family: 'spacer',
					name: `${material}-${size}`,
					specs: { material, size, ul94: material === 'PA66' ? 'V-2' : 'HB', uv: false }
				},
				`pl-sp-${size}-${material}`.toLowerCase()
			);
		}
	}
	for (const size of ['6x8x6', '8x10x8', '10x12x10', '12x14x12', '16x18x15', '20x23x20']) {
		add(
			{
				category: 'plastic',
				standard: 'ISO 3547',
				family: 'bushing',
				name: `POM-${size}`,
				specs: { material: 'POM', size, ul94: 'HB', uv: false }
			},
			`pl-bu-${size}`
		);
	}

	// usb-c: 25
	const usb: [string, number, number, string, boolean][] = [];
	for (const len of [0.5, 1, 2]) {
		for (const watt of [60, 100, 240]) {
			usb.push(['C-C', len, watt, watt === 240 ? 'USB2' : 'USB3.2', watt > 60]);
		}
	}
	for (const len of [0.3, 1.5, 3]) {
		for (const watt of [60, 100]) usb.push(['C-C', len, watt, 'USB2', watt > 60]);
	}
	for (const len of [0.5, 1, 2]) {
		for (const watt of [15, 60]) usb.push(['C-A', len, watt, 'USB3.2', false]);
	}
	usb.push(
		['C-C', 1, 240, 'USB4', true],
		['C-C', 2, 240, 'USB4', true],
		['C-C', 0.5, 240, 'USB4', true],
		['C-C', 1, 100, 'USB4', true]
	);
	for (const [type, len, watt, gen, emarker] of usb.slice(0, 25)) {
		add(
			{
				category: 'usbc',
				standard: watt === 240 ? 'USB PD 3.1 EPR' : 'USB PD 3.0',
				family: type === 'C-C' ? 'c-to-c' : 'c-to-a',
				name: `${type}-${len}m-${watt}W-${gen}`,
				specs: { type, length_m: len, max_watt: watt, usb_gen: gen, emarker }
			},
			`ub-${type}-${len}m-${watt}w-${gen}`.toLowerCase()
		);
	}

	// interior: 25
	for (const overlay of ['full', 'half', 'inset']) {
		for (const softClose of [true, false]) {
			for (const angle of [110, 165]) {
				add(
					{
						category: 'interior',
						standard: '35mm cup',
						family: 'cup-hinge',
						name: `35mm-${overlay}-${angle}-${softClose ? 'soft' : 'std'}`,
						specs: { cup_mm: 35, overlay, angle, soft_close: softClose }
					},
					`in-hg-35-${overlay}-${angle}-${softClose ? 'sc' : 'std'}`
				);
			}
		}
	}
	for (const len of [300, 400, 450, 500, 550]) {
		add(
			{
				category: 'interior',
				standard: 'full-extension',
				family: 'drawer-rail',
				name: `${len}mm-soft`,
				specs: { length_mm: len, soft_close: true, load_kg: 35 }
			},
			`in-dr-${len}`
		);
	}
	for (const [voltage, cct] of [
		[12, 3000],
		[24, 2700],
		[24, 3000],
		[24, 4000],
		[24, 6500],
		[12, 6500],
		[24, 3500],
		[12, 4000]
	] as const) {
		add(
			{
				category: 'interior',
				standard: 'IP20',
				family: 'led-strip',
				name: `${voltage}V-${cct}K-CRI90-5m`,
				specs: { voltage, cct, cri: 90, length_m: 5 }
			},
			`in-led-${voltage}v-${cct}k`
		);
	}
	return out;
}

const BASE_PRICE: Record<string, number> = {
	'socket-cap': 0.019,
	'hex-nut': 0.009,
	washer: 0.004,
	'cable-tie': 0.006,
	spacer: 0.03,
	bushing: 0.11,
	'c-to-c': 1.4,
	'c-to-a': 0.9,
	'cup-hinge': 0.45,
	'drawer-rail': 3.2,
	'led-strip': 6.5
};

// Offers the demo scenarios rely on, matching the earlier clickable prototype.
const FIXED: [string, string, number, number, number, number][] = [
	['fs-912-m4x12-a2-70', 'taobao', 0.018, 500, 9, 5],
	['fs-912-m4x12-a2-70', 'alibaba', 0.021, 1000, 12, 20],
	['fs-912-m4x12-a2-70', 'amazon', 0.089, 100, 5, 2],
	['fs-912-m4x12-a2-70', 'mcmaster', 0.124, 50, 7, 30],
	['fs-912-m4x12-a2-70', '1688', 0.012, 5000, 15, 8],
	['fs-4762-m4x12-a2-70', 'misumi', 0.035, 100, 6, 12],
	['fs-4762-m4x12-a2-70', 'alibaba', 0.024, 500, 14, 70],
	['fs-912-m4x12-a4-70', 'amazon', 0.11, 100, 5, 3],
	['fs-912-m4x12-a4-70', 'alibaba', 0.038, 1000, 12, 26],
	['pl-ct-3.6x200-black', 'taobao', 0.0061, 1000, 8, 6],
	['pl-ct-3.6x200-black', 'alibaba', 0.0042, 10000, 15, 18],
	['pl-ct-3.6x200-black', 'misumi', 0.012, 1000, 6, 40],
	['pl-ct-3.6x200-black', 'amazon', 0.031, 100, 4, 3],
	['pl-ct-3.6x200-black', '1688', 0.0038, 50000, 18, 10],
	['pl-ct-3.6x200-natural', 'alibaba', 0.0035, 10000, 15, 9],
	['pl-ct-3.6x200-natural', 'taobao', 0.005, 1000, 8, 4],
	['ub-c-c-1m-240w-usb2', 'taobao', 2.3, 50, 8, 7],
	['ub-c-c-1m-240w-usb2', 'aliexpress', 2.6, 10, 10, 15],
	['ub-c-c-1m-240w-usb2', 'amazon', 4.9, 1, 3, 2],
	['ub-c-c-1m-240w-usb2', 'alibaba', 1.85, 500, 12, 22],
	['ub-c-c-1m-100w-usb3.2', 'taobao', 1.2, 50, 8, 11],
	['ub-c-c-1m-100w-usb3.2', 'amazon', 2.9, 1, 3, 5],
	['in-hg-35-full-110-sc', 'taobao', 0.48, 100, 7, 5],
	['in-hg-35-full-110-sc', 'misumi', 1.35, 20, 6, 30],
	['in-hg-35-full-110-sc', 'amazon', 2.1, 10, 4, 3],
	['in-hg-35-full-110-sc', 'alibaba', 0.62, 500, 14, 60],
	['in-hg-35-full-110-sc', '1688', 0.4, 1000, 16, 12],
	['in-hg-35-full-110-std', 'taobao', 0.29, 100, 7, 8],
	['in-led-24v-3000k', 'amazon', 18.9, 1, 4, 4],
	['in-led-24v-3000k', 'taobao', 6.5, 5, 9, 14]
];

function makeOffer(
	n: number,
	productId: string,
	vendorId: string,
	price: number,
	moq: number,
	lead: number,
	ageH: number,
	rand: () => number
): Offer {
	const v = VENDOR_PROFILE[vendorId];
	const shipsTo = v[3] ? ['KR', 'US', 'JP', 'DE'] : ['CN'];
	const raw = Math.round(42000 + rand() * 46000);
	const clean = Math.round(380 + rand() * 260);
	const id = `of-${String(n).padStart(3, '0')}`;
	return {
		id,
		productId,
		vendorId,
		unitPriceUsd: price,
		moq,
		leadTimeDays: lead,
		shipsTo,
		fetchedHoursAgo: ageH,
		sourceUrl: `https://${VENDOR_DOMAIN[vendorId]}/item/${fnv(id + productId).slice(0, 8)}`,
		rawTokens: raw,
		cleanTokens: clean,
		dataHash: '0x' + fnv(`${productId}|${vendorId}|${price}|${moq}`)
	};
}

function buildOffers(products: Product[]): Offer[] {
	const rand = mulberry32(912);
	const offers: Offer[] = [];
	let n = 1;
	const fixedIds = new Set(FIXED.map((f) => f[0]));
	for (const [pid, vid, price, moq, lead, age] of FIXED) {
		offers.push(makeOffer(n++, pid, vid, price, moq, lead, age, rand));
	}
	const vendorIds = VENDORS.map((v) => v.id);
	for (const p of products) {
		if (fixedIds.has(p.id)) continue;
		const count = 3 + Math.floor(rand() * 2);
		const picked = [...vendorIds].sort(() => rand() - 0.5).slice(0, count);
		for (const vid of picked) {
			const [mult, moqs, lead] = VENDOR_PROFILE[vid];
			const base = BASE_PRICE[p.family] ?? 1;
			const price = +(base * mult * (0.85 + rand() * 0.4)).toFixed(base < 0.1 ? 4 : 2);
			const moq = moqs[Math.floor(rand() * moqs.length)];
			offers.push(
				makeOffer(
					n++,
					p.id,
					vid,
					price,
					moq,
					lead + Math.floor(rand() * 4),
					Math.floor(1 + rand() * 90),
					rand
				)
			);
		}
	}
	return offers;
}

export const PRODUCTS = buildProducts();
export const OFFERS = buildOffers(PRODUCTS);
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const VENDOR_BY_ID = Object.fromEntries(VENDORS.map((v) => [v.id, v]));

export const STATS = {
	categories: CATEGORIES.length,
	products: PRODUCTS.length,
	offers: OFFERS.length,
	vendors: VENDORS.length,
	updatedHoursAgo: 2
};
