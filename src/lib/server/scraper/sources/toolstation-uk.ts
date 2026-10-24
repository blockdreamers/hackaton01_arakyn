import { parse } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Toolstation UK. robots.txt (User-agent: *) blocks /search?*, /products?*, /trolley, /checkout,
// /campaign/, deals/new/brand/gift facets, URLs with 3+ '&' and many facet params, but not plain
// category listings with a single ?page= param. No crawl-delay is set.
// Listing: /{department}/{slug}/c{id}?page=N, server-rendered (Nuxt), 48 products per page.
// Second-level categories from the main menu list all products of their sub-categories.
const BASE = 'https://www.toolstation.com';

// promotional trees that duplicate the regular departments
const SKIP_DEPARTMENTS = new Set(['deals', 'sale-clearance', 'new', 'gifts', 'brand', 'campaign']);

const text = (s: string | undefined) =>
	s
		?.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim() ?? '';

function parsePrice(value: string | undefined): number | null {
	const m = value?.replace(/,/g, '').match(/£\s*(\d+(?:\.\d+)?)/);
	return m ? Number(m[1]) : null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	return parse(html)
		.querySelectorAll('[data-testid="product-card"]')
		.flatMap((card) => {
			const href = card
				.querySelector('a[data-testid="product-card-image-link"]')
				?.getAttribute('href');
			const externalId =
				href?.match(/\/p([A-Za-z0-9]+)$/)?.[1] ??
				card.textContent.match(/Product code:\s*([A-Za-z0-9]+)/)?.[1];
			const name = text(card.querySelector('a > p.font-semibold')?.textContent);
			if (!href || !externalId || !name) return [];

			const img = card.querySelector('img[data-testid="plp-product-main-image"]');
			const src = img?.getAttribute('src');
			// brand logo overlay; otherwise the main image alt is "Brand / Product name"
			const logo = card.querySelector('img[src*="brand-img"]')?.getAttribute('alt');
			const altBrand = img?.getAttribute('alt')?.split(' / ');

			// shown price is inc. VAT; "ex. VAT £x" sits in a separate line
			const priceLine = card.querySelector('p.leading-10');
			const price = parsePrice(priceLine?.querySelector('span.font-bold')?.textContent);
			const was = priceLine
				?.querySelectorAll('span')
				.find((s) => /was\s*£/i.test(s.textContent))?.textContent;
			return [
				{
					externalId,
					name,
					price,
					listPrice: parsePrice(was) ?? price,
					imageUrl: src ? new URL(src, BASE).toString() : null,
					url: new URL(href, BASE).toString(),
					brand: text(logo) || (altBrand && altBrand.length > 1 ? text(altBrand[0]) : '') || null
				}
			];
		});
}

const listUrl = (id: string, page: number) => `${BASE}${id}${page > 1 ? `?page=${page}` : ''}`;

function parsePageCount(html: string): number {
	const m = html.match(/Page\s+\d+\s+of\s+(\d+)/);
	return m ? Number(m[1]) : 1;
}

export const toolstationUk: SiteScraper = {
	code: 'toolstation_uk',
	name: 'Toolstation UK',
	baseUrl: BASE,
	country: 'GB',
	currency: 'GBP',
	delayMs: 2000,

	async categories(fetch) {
		// the main menu on the home page links every department's second-level categories
		const root = parse(await fetch(`${BASE}/`));
		const seen = new Map<string, Category>();
		for (const a of root.querySelectorAll('a[href]')) {
			const href = a.getAttribute('href') ?? '';
			const m = href.match(/^\/([a-z0-9-]+)\/[a-z0-9-]+\/c\d+$/);
			if (!m || SKIP_DEPARTMENTS.has(m[1]) || seen.has(href)) continue;
			const name = text(a.textContent);
			if (name) seen.set(href, { id: href, name });
		}
		return [...seen.values()];
	},

	async *categoryPages(fetch, category, maxPages) {
		const first = await fetch(listUrl(category.id, 1));
		const pages = Math.min(parsePageCount(first), maxPages);
		yield parseProducts(first);
		for (let page = 2; page <= pages; page++) {
			const items = parseProducts(await fetch(listUrl(category.id, page)));
			if (items.length === 0) break;
			yield items;
		}
	}
};
