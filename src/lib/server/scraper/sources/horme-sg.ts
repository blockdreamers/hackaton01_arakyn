import { parse } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Horme Hardware (Singapore). robots.txt (User-agent: *) only disallows /tag_query.aspx; no
// crawl-delay for '*'. The products.aspx?c={id} page is a shell that loads its grid from
// ajax_products_query.aspx (server-rendered HTML fragment, 28 products per page, with a hidden
// #totalpage input). The card has no brand, so the category's brand filter list
// (ajax_related_brand_query.aspx) is fetched once and matched against the product name prefix.
// Prices are shown "w/GST".
const BASE = 'https://www.horme.com.sg';
const PAGE_SIZE = 28;

const clean = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim() ?? '';

function parsePrice(value: string | undefined): number | null {
	const m = value?.replace(/,/g, '').match(/S\$\s*(\d+(?:\.\d+)?)/);
	return m ? Number(m[1]) : null;
}

/** pick the brand whose name the product name starts with (or whose first word matches) */
function matchBrand(name: string, brands: string[]): string | null {
	const upper = name.toUpperCase();
	const full = brands
		.filter((b) => upper.startsWith(b.toUpperCase() + ' '))
		.sort((a, b) => b.length - a.length)[0];
	if (full) return full;
	const first = upper.split(' ')[0];
	const byWord = brands.filter((b) => b.toUpperCase().split(' ')[0] === first);
	return byWord.length === 1 ? byWord[0] : null;
}

export function parseBrands(html: string): string[] {
	return parse(html)
		.querySelectorAll('label')
		.filter((l) => l.querySelector('input.cbBrandFilter'))
		.map((l) => clean(l.text))
		.filter(Boolean);
}

export function parseProducts(html: string, brands: string[] = []): ScrapedProduct[] {
	return parse(html)
		.querySelectorAll('div.single__pro')
		.flatMap((card) => {
			const link = card.querySelector('.product__details h2 a');
			const href = link?.getAttribute('href');
			const externalId = href?.match(/product\.aspx\?id=(\d+)/i)?.[1];
			const name = clean(link?.text);
			if (!externalId || !name) return [];

			const src = card.querySelector('.pro__thumb a img')?.getAttribute('src');
			const price = parsePrice(card.querySelector('.popular__pro__price')?.text);
			const strike = parsePrice(card.querySelector('.popular__pro__price_strike')?.text);
			return [
				{
					externalId,
					name,
					price,
					listPrice: strike ?? price,
					imageUrl: src ? new URL(src, BASE).toString() : null,
					url: `${BASE}/product.aspx?id=${externalId}`,
					brand: matchBrand(name, brands)
				}
			];
		});
}

const listUrl = (id: string, page: number) =>
	`${BASE}/ajax_products_query.aspx?c=${id}&b=&pagesize=${PAGE_SIZE}&page=${page}` +
	`&sort=&order=&range=0_15000&ft=&showall=p&instoreLoc=`;

function parsePageCount(html: string): number {
	const m = html.match(/id="totalpage"\s+value="(\d+)"/);
	return m ? Number(m[1]) : 1;
}

export const hormeSg: SiteScraper = {
	code: 'horme_sg',
	name: 'Horme Hardware',
	baseUrl: BASE,
	country: 'SG',
	currency: 'SGD',
	priceIncludesTax: true,
	delayMs: 2000,

	async categories(fetch) {
		// the home page's category menu links every leaf listing (products.aspx?c=N)
		const root = parse(await fetch(`${BASE}/`));
		const seen = new Map<string, Category>();
		for (const a of root.querySelectorAll('li.cat-list-group-item a[href]')) {
			const id = a.getAttribute('href')?.match(/^products\.aspx\?c=(\d+)$/)?.[1];
			const name = clean(a.text);
			if (id && name && !seen.has(id)) seen.set(id, { id, name });
		}
		return [...seen.values()];
	},

	async *categoryPages(fetch, category, maxPages, startPage = 1) {
		let brands: string[] = [];
		try {
			brands = parseBrands(
				await fetch(`${BASE}/ajax_related_brand_query.aspx?c=${category.id}&t=cb&s=&bl=&showall=p`)
			);
		} catch {
			// brand is optional; keep scraping without it
		}

		const first = await fetch(listUrl(category.id, startPage));
		const total = parsePageCount(first);
		const last = Math.min(total, startPage + maxPages - 1);
		const items = parseProducts(first, brands);
		if (items.length === 0) return;
		yield items;
		for (let page = startPage + 1; page <= last; page++) {
			const next = parseProducts(await fetch(listUrl(category.id, page)), brands);
			if (next.length === 0) break;
			yield next;
		}
	}
};
