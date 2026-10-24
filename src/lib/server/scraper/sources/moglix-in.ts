import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Moglix (India B2B MRO). robots.txt (User-agent: *) blocks /search*, /q/*, /a/, /dashboard,
// /manufacturers, /rfq*, the amp mirrors and URLs with ?p=, ?n=, ?category=, ?id_category= etc.,
// but not plain category listings with a single ?page= param. No crawl-delay is set.
// Listing: /{l0}/{l1}/{id}?page=N, server-rendered Angular; the products (40 per page) sit in
// the transfer state <script id="ssr-pwa-state"> under "refresh-{categoryId}".
// A category lists the products of all its sub-categories; /all-categories has the full tree.
const BASE = 'https://www.moglix.com';
const CDN = 'https://cdn.moglix.com/';

interface MoglixProduct {
	moglixPartNumber?: string;
	productName?: string;
	productUrl?: string;
	salesPrice?: number | null;
	mrp?: number | null;
	brandName?: string | null;
	mainImageLink?: string | null;
}

interface CategoryNode {
	categoryDetails: { categoryId: string; categoryName: string; categoryLink: string };
	children?: CategoryNode[];
}

// Angular TransferState escapes JSON with &q; &a; &s; &l; &g;
function transferState(html: string): Record<string, unknown> | null {
	const m = html.match(/<script id="ssr-pwa-state"[^>]*>([\s\S]*?)<\/script>/);
	if (!m) return null;
	const raw = m[1]
		.replace(/&q;/g, '"')
		.replace(/&s;/g, "'")
		.replace(/&l;/g, '<')
		.replace(/&g;/g, '>')
		.replace(/&a;/g, '&');
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function searchResult(html: string): { totalCount: number; products: MoglixProduct[] } | null {
	const state = transferState(html);
	if (!state) return null;
	for (const [key, value] of Object.entries(state)) {
		if (!key.startsWith('refresh-')) continue;
		const result = (value as { productSearchResult?: { totalCount?: number; products?: [] } })
			?.productSearchResult;
		if (result) return { totalCount: result.totalCount ?? 0, products: result.products ?? [] };
	}
	return null;
}

const positive = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null);

function toProducts(products: MoglixProduct[]): ScrapedProduct[] {
	return products.flatMap((p) => {
		const externalId = p.moglixPartNumber?.trim().toUpperCase();
		const name = p.productName?.replace(/\s+/g, ' ').trim();
		if (!externalId || !name || !p.productUrl) return [];
		// salesPrice is the shown price incl. GST (priceWithoutTax * (1 + taxPercentage)); mrp is struck
		const price = positive(p.salesPrice);
		const mrp = positive(p.mrp);
		return [
			{
				externalId,
				name,
				price,
				listPrice: mrp && (!price || mrp >= price) ? mrp : price,
				imageUrl: p.mainImageLink ? new URL(p.mainImageLink, CDN).toString() : null,
				url: new URL(p.productUrl.replace(/^\/+/, ''), `${BASE}/`).toString(),
				brand: p.brandName?.trim() || null
			}
		];
	});
}

export function parseProducts(html: string): ScrapedProduct[] {
	return toProducts(searchResult(html)?.products ?? []);
}

const PAGE_SIZE = 40;
const listUrl = (id: string, page: number) => `${BASE}${id}${page > 1 ? `?page=${page}` : ''}`;

export const moglixIn: SiteScraper = {
	code: 'moglix_in',
	name: 'Moglix',
	baseUrl: BASE,
	country: 'IN',
	currency: 'INR',
	priceIncludesTax: true,
	delayMs: 2000,

	async categories(fetch) {
		// second-level categories of the full tree (top-level ones without children as-is);
		// deeper levels are covered because a category lists its sub-categories' products
		const state = transferState(await fetch(`${BASE}/all-categories`));
		const tree =
			(state?.detailedCategoryPage as { categories?: CategoryNode[] } | undefined)?.categories ??
			[];
		const found = new Map<string, Category>();
		const add = (node: CategoryNode) => {
			const { categoryId, categoryName, categoryLink } = node.categoryDetails;
			if (!categoryLink || found.has(categoryId)) return;
			found.set(categoryId, { id: `/${categoryLink.replace(/^\/+/, '')}`, name: categoryName });
		};
		for (const top of tree) {
			if (top.children?.length) top.children.forEach(add);
			else add(top);
		}
		return [...found.values()];
	},

	async *categoryPages(fetch, category, maxPages, startPage = 1) {
		let last = maxPages;
		for (let page = Math.max(1, startPage); page <= last; page++) {
			const result = searchResult(await fetch(listUrl(category.id, page)));
			const items = toProducts(result?.products ?? []);
			if (items.length === 0) break;
			yield items;
			last = Math.min(maxPages, Math.ceil((result?.totalCount ?? 0) / PAGE_SIZE));
		}
	}
};
