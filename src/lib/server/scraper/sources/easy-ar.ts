import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Easy Argentina (Cencosud home improvement), a VTEX IO store. robots.txt (User-agent: *) only
// blocks /admin/*, /account*, /p?idsku=*, ?map=category* and ?initialMap=*; no crawl-delay.
// Listing: /{department}/{category}?page=N, server-rendered; the products (21 per page) sit in
// the Apollo cache <template data-varname="__STATE__"> under $ROOT_QUERY.productSearch(...).
// A category lists the products of all its sub-categories; /sitemap/category-0.xml has the tree.
const BASE = 'https://www.easy.com.ar';
const PAGE_SIZE = 21;
// VTEX search refuses offsets beyond 2500
const MAX_PAGE = Math.floor(2500 / PAGE_SIZE);

type Ref = { id: string };
type State = Record<string, Record<string, unknown>>;

interface Offer {
	Price?: number;
	ListPrice?: number;
	AvailableQuantity?: number;
}

function apolloState(html: string): State | null {
	const m = html.match(/data-varname="__STATE__">\s*<script>([\s\S]*?)<\/script>/);
	if (!m) return null;
	try {
		return JSON.parse(m[1]);
	} catch {
		return null;
	}
}

const positive = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null);

function toProduct(state: State, p: Record<string, unknown>): ScrapedProduct | null {
	const deref = (r: unknown) => (r && typeof r === 'object' ? state[(r as Ref).id] : undefined);
	const externalId = String(p.productId ?? '').trim();
	const name = String(p.productName ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const link = p.link as string | undefined;
	if (!externalId || !name || !link) return null;

	const items = (p['items({"filter":"ALL"})'] as Ref[] | undefined) ?? [];
	const sku = deref(items[0]);
	const sellers = ((sku?.sellers as Ref[] | undefined) ?? []).map(deref).filter(Boolean);
	const seller = sellers.find((s) => s?.sellerDefault) ?? sellers[0];
	const offer = deref(seller?.commertialOffer) as Offer | undefined;
	// Price is the shown price incl. IVA (properties carry price_wo_taxes = Price / 1.21);
	// out-of-stock offers come with Price 0
	const inStock = (offer?.AvailableQuantity ?? 0) > 0;
	const price = inStock ? positive(offer?.Price) : null;
	const list = inStock ? positive(offer?.ListPrice) : null;
	const image = deref(((sku?.images as Ref[] | undefined) ?? [])[0])?.imageUrl as
		string | undefined;

	return {
		externalId,
		name,
		price,
		listPrice: list && (!price || list >= price) ? list : price,
		imageUrl: image ? new URL(image, BASE).toString() : null,
		url: new URL(link, BASE).toString(),
		brand: (p.brand as string | undefined)?.trim() || null
	};
}

interface SearchResult {
	total: number;
	products: ScrapedProduct[];
}

// the page's main productSearch query (the one with the most products)
function searchResult(html: string): SearchResult | null {
	const state = apolloState(html);
	if (!state) return null;
	let best: { total: number; refs: Ref[] } | null = null;
	for (const [key, value] of Object.entries(state)) {
		if (!key.startsWith('$ROOT_QUERY.productSearch(') || !Array.isArray(value.products)) continue;
		const refs = value.products as Ref[];
		if (!best || refs.length > best.refs.length)
			best = { total: Number(value.recordsFiltered) || 0, refs };
	}
	if (!best) return null;
	const seen = new Set<string>();
	const products = best.refs.flatMap((r) => {
		const product = state[r.id] && toProduct(state, state[r.id]);
		if (!product || seen.has(product.externalId)) return [];
		seen.add(product.externalId);
		return [product];
	});
	return { total: best.total, products };
}

export function parseProducts(html: string): ScrapedProduct[] {
	return searchResult(html)?.products ?? [];
}

const listUrl = (id: string, page: number) => `${BASE}${id}${page > 1 ? `?page=${page}` : ''}`;

export const easyAr: SiteScraper = {
	code: 'easy_ar',
	name: 'Easy',
	baseUrl: BASE,
	country: 'AR',
	currency: 'ARS',
	priceIncludesTax: true,
	delayMs: 2000,

	async categories(fetch) {
		// second-level categories (departments without children as-is); deeper levels are
		// covered because a category lists its sub-categories' products
		const xml = await fetch(`${BASE}/sitemap/category-0.xml`);
		const paths = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
			.map((m) => new URL(m[1]).pathname.replace(/\/+$/, ''))
			.filter((p) => p.length > 1);
		const depth = (p: string) => p.split('/').length - 1;
		const found = new Map<string, Category>();
		const name = (p: string) => {
			const slug = p.slice(p.lastIndexOf('/') + 1).replace(/-/g, ' ');
			return slug.charAt(0).toUpperCase() + slug.slice(1);
		};
		for (const p of paths) {
			if (depth(p) === 2) found.set(p, { id: p, name: name(p) });
			else if (depth(p) === 1 && !paths.some((c) => c.startsWith(`${p}/`)))
				found.set(p, { id: p, name: name(p) });
		}
		return [...found.values()];
	},

	async *categoryPages(fetch, category, maxPages, startPage = 1) {
		let last = Math.min(maxPages, MAX_PAGE);
		for (let page = Math.max(1, startPage); page <= last; page++) {
			const result = searchResult(await fetch(listUrl(category.id, page)));
			const items = result?.products ?? [];
			if (items.length === 0) break;
			yield items;
			last = Math.min(maxPages, MAX_PAGE, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
		}
	}
};
