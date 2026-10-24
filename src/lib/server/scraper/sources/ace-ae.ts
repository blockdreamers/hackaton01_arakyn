import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// ACE UAE (home improvement). PARTIAL COVERAGE: only page 1 of each category is reachable
// server-side. The listing HTML embeds the first 20 Algolia hits in
// window[Symbol.for("InstantSearchInitialResults")], but the server ignores ?page=N (always
// returns page 0); later pages are fetched client-side from Algolia, which we don't call.
// So we take page 1 (about 20 items) of every deepest category from the category sitemap.
// robots.txt (User-agent: *) allows /en/category/ and /en/products/, disallows ?sortBy=,
// ?refinementList, ?query= and account/cart paths; no crawl-delay. Prices are AED incl. 5% VAT.
const BASE = 'https://www.aceuae.com';
const CATEGORY_SITEMAP = `${BASE}/sitemap/sitemap-ae-hardware-en-categories.xml`;

interface AceHit {
	productID?: string;
	objectID?: string;
	ProductTitle?: { EN?: string };
	productSalePrice?: number | null;
	productPrice?: number | null;
	imageURL?: string[];
	brand?: { EN?: string };
}

const positive = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? n : null);

/** the site's product slug: lowercase, drop . and apostrophes, other non-alphanumerics -> '-' */
const slugify = (title: string) =>
	title
		.toLowerCase()
		.replace(/[.'’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

function initialHits(html: string): AceHit[] {
	const m = html.match(
		/<script>window\[Symbol\.for\("InstantSearchInitialResults"\)\] = ([\s\S]*?)<\/script>/
	);
	if (!m) return [];
	try {
		const data = JSON.parse(m[1].replace(/;\s*$/, '')) as Record<
			string,
			{ results?: { hits?: AceHit[] }[] }
		>;
		return Object.values(data).flatMap((v) => v.results?.[0]?.hits ?? []);
	} catch {
		return [];
	}
}

export function parseProducts(html: string): ScrapedProduct[] {
	const seen = new Map<string, ScrapedProduct>();
	for (const h of initialHits(html)) {
		const externalId = (h.productID ?? h.objectID)?.trim();
		const name = h.ProductTitle?.EN?.replace(/\s+/g, ' ').trim();
		if (!externalId || !name || seen.has(externalId)) continue;
		const listPrice = positive(h.productPrice);
		const price = positive(h.productSalePrice) ?? listPrice;
		const image = h.imageURL?.find(Boolean);
		seen.set(externalId, {
			externalId,
			name,
			price,
			listPrice: listPrice && (!price || listPrice >= price) ? listPrice : price,
			imageUrl: image ? new URL(image, 'https://x').toString().replace(/^http:/, 'https:') : null,
			url: `${BASE}/en/products/${slugify(name)}/${externalId}`,
			brand: h.brand?.EN?.trim() || null
		});
	}
	return [...seen.values()];
}

const humanise = (segment: string) =>
	segment
		.split('-')
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

export const aceAe: SiteScraper = {
	code: 'ace_ae',
	name: 'ACE UAE',
	baseUrl: BASE,
	country: 'AE',
	currency: 'AED',
	priceIncludesTax: true,
	delayMs: 2000,

	async categories(fetch) {
		const xml = await fetch(CATEGORY_SITEMAP);
		const paths = [
			...new Set(
				[
					...xml.matchAll(
						/<loc>\s*https?:\/\/www\.aceuae\.com\/en\/category\/([^<\s]+?)\/?\s*<\/loc>/g
					)
				].map((m) => m[1])
			)
		];
		// deepest only: drop a category whose path is a prefix of another one
		const leaves = paths.filter((p) => !paths.some((q) => q.startsWith(`${p}/`)));
		return leaves.map((id): Category => {
			const parts = id.split('/');
			return { id, name: parts.slice(-2).map(humanise).join(' > ') };
		});
	},

	async *categoryPages(fetch, category, maxPages, startPage = 1) {
		// only page 1 exists server-side; never request ?page=N
		if (startPage > 1 || maxPages < 1) return;
		const items = parseProducts(await fetch(`${BASE}/en/category/${category.id}`));
		if (items.length > 0) yield items;
	}
};
