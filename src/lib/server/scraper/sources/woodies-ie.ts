import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Woodie's (Ireland DIY / home). robots.txt (User-agent: *) allows / but blocks Magento system
// paths (/catalog/*, /catalogsearch/, /checkout/, /media/ except product images ...), the
// ?dir/?order/?limit/?mode sort params and ?<attribute>= facets. Plain ?page=N is allowed.
// No crawl-delay is set.
// Listing: /{department}/{group}/{leaf}?page=N, server-rendered Magento PWA (React + Apollo).
// The Apollo cache is embedded in <script type="text/json" id="apollo-client-state">; the
// products query (36 per page) holds refs to SimpleProduct/ConfigurableProduct entries.
// Department / group pages are landing pages without products, so we crawl the menu leaves.
const BASE = 'https://www.woodies.ie';

// promotional / seasonal-duplicate trees of the main menu
const SKIP_TOP = new Set(['events', 'brand']);

type Cache = Record<string, Record<string, unknown>>;
interface Ref {
	type: 'id';
	id: string;
}

function apolloState(html: string): Cache | null {
	const m = html.match(/<script type="text\/json" id="apollo-client-state">([\s\S]*?)<\/script>/);
	if (!m) return null;
	try {
		return JSON.parse(m[1]);
	} catch {
		return null;
	}
}

const isRef = (v: unknown): v is Ref =>
	!!v && typeof v === 'object' && (v as Ref).type === 'id' && typeof (v as Ref).id === 'string';

/** follow a dotted path through the cache, resolving Apollo refs on the way */
function get(cache: Cache, value: unknown, ...path: string[]): unknown {
	let cur = isRef(value) ? cache[value.id] : value;
	for (const key of path) {
		if (!cur || typeof cur !== 'object') return undefined;
		const next = (cur as Record<string, unknown>)[key];
		cur = isRef(next) ? cache[next.id] : next;
	}
	return cur;
}

interface ProductList {
	items: Ref[];
	totalPages: number;
}

function productList(cache: Cache): ProductList | null {
	for (const [key, value] of Object.entries(cache)) {
		const m = key.match(/^\$?ROOT_QUERY\.products\((.*)\)$/);
		if (!m || !Array.isArray(value.items)) continue;
		let args: { pageSize?: number; filter?: { category_id?: unknown } };
		try {
			args = JSON.parse(m[1]);
		} catch {
			continue;
		}
		if (!args.filter?.category_id || (args.pageSize ?? 0) <= 1) continue;
		const totalPages = Number(get(cache, value, 'page_info', 'total_pages')) || 1;
		return { items: value.items.filter(isRef), totalPages };
	}
	return null;
}

const money = (cache: Cache, product: unknown, field: string) => {
	const n = get(cache, product, 'price_range', 'minimum_price', field, 'value');
	return typeof n === 'number' && n > 0 ? n : null;
};

function toProducts(cache: Cache, list: ProductList | null): ScrapedProduct[] {
	return (list?.items ?? []).flatMap((ref) => {
		const p = cache[ref.id];
		const id = p?.id;
		const name = typeof p?.name === 'string' ? p.name.replace(/\s+/g, ' ').trim() : '';
		const urlKey = typeof p?.url_key === 'string' ? p.url_key : '';
		if (id == null || !name || !urlKey) return [];
		// final_price is the shown price (VAT incl.); regular_price is the struck "was" price
		const price = money(cache, p, 'final_price');
		const regular = money(cache, p, 'regular_price');
		const image = get(cache, p, 'small_image', 'url');
		return [
			{
				externalId: String(id),
				name,
				price,
				listPrice: regular && (!price || regular > price) ? regular : price,
				imageUrl: typeof image === 'string' && image ? new URL(image, BASE).toString() : null,
				url: `${BASE}/${urlKey.replace(/^\/+/, '')}`,
				// the listing data carries no brand / manufacturer attribute
				brand: null
			}
		];
	});
}

export function parseProducts(html: string): ScrapedProduct[] {
	const cache = apolloState(html);
	return cache ? toProducts(cache, productList(cache)) : [];
}

const listUrl = (id: string, page: number) => `${BASE}${id}${page > 1 ? `?page=${page}` : ''}`;

export const woodiesIe: SiteScraper = {
	code: 'woodies_ie',
	name: "Woodie's",
	baseUrl: BASE,
	country: 'IE',
	currency: 'EUR',
	priceIncludesTax: true,
	delayMs: 2000,

	async categories(fetch) {
		// leaf categories of the main mega menu (embedded in the home page's Apollo cache)
		const cache = apolloState(await fetch(`${BASE}/`)) ?? {};
		const found = new Map<string, Category>();
		for (const [key, node] of Object.entries(cache)) {
			if (!/jhMenu\(\{"identifier":"main-mega-menu"\}\)/.test(key)) continue;
			const url = typeof node.url === 'string' ? node.url : '';
			const children = Array.isArray(node.children) ? node.children : [];
			if (node.type !== 'category' || children.length > 0) continue;
			const parts = url.split('/').filter(Boolean);
			if (parts.length < 2 || SKIP_TOP.has(parts[0]) || parts.at(-1)!.startsWith('shop-all')) {
				continue;
			}
			const id = `/${parts.join('/')}`;
			const name = typeof node.title === 'string' ? node.title.trim() : '';
			if (name && !found.has(id)) found.set(id, { id, name });
		}
		return [...found.values()];
	},

	async *categoryPages(fetch, category, maxPages, startPage = 1) {
		let last = maxPages;
		for (let page = Math.max(1, startPage); page <= last; page++) {
			const cache = apolloState(await fetch(listUrl(category.id, page)));
			if (!cache) break;
			const list = productList(cache);
			const items = toProducts(cache, list);
			if (items.length === 0) break;
			yield items;
			last = Math.min(maxPages, list?.totalPages ?? 1);
		}
	}
};
