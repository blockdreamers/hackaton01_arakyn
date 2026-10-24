import { parse, type HTMLElement } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Hoffmann Group Germany. robots.txt (`*`): Crawl-delay 5; disallows /search, /v2/search,
// /v2/categorysearch/, */filter, */async/, /api, *.json etc. Listings come from category pages
// /DE/de/hom/{slug path}/c/{code}?page={n} (0-based, 60 items per page). Short /c/{code} URLs
// redirect to the slug path and drop the query, so category ids are the full slug path.
// A listing shows at most 6,000 results (100 pages), so categories() descends the tree until
// every returned category has <= 6,000 results (counts come from the category tiles).
const BASE = 'https://www.hoffmann-group.com';
const SHOP = `${BASE}/DE/de/hom/`;
const PAGE_SIZE = 60;
const MAX_RESULTS = 6000;

const text = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim() ?? '';

/** "1.234,56 €" -> 1234.56 */
function parseEuro(value: string | undefined): number | null {
	const m = value?.match(/(\d[\d.]*,\d{2})/);
	return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

// GARANT/HOLEX etc. are shown as a logo (alt = brand), other manufacturers as plain text
function parseBrand(item: HTMLElement): string | null {
	const info = item.querySelector(
		'span.productListerItemDetails_productInfo:not(.qs_productitem_articlecode)'
	);
	if (!info) return null;
	return text(info.querySelector('img')?.getAttribute('alt') ?? info.textContent) || null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	return parse(html)
		.querySelectorAll('div.product-lister-item-container')
		.flatMap((item) => {
			const link = item.querySelector('a.productListerItemDetails_productTitle');
			const href = link?.getAttribute('href');
			const externalId =
				text(item.querySelector('.qs_productitem_articlecode')?.textContent).replace(
					/^Art\.-Nr\.:\s*/,
					''
				) || item.getAttribute('data-tracking-product-code');
			const name = text(link?.getAttribute('title') || link?.textContent);
			if (!href || !externalId || !name) return [];

			const img = item.querySelector('.list-products-image img');
			const src = img?.getAttribute('data-src') || img?.getAttribute('src');
			// main price is gross (inkl. MwSt.); "ab" = lowest price among variants.
			// Discounted items show the regular price in .crossedout-price
			const price = parseEuro(item.querySelector('.main-price')?.getAttribute('data-price'));
			const crossed = parseEuro(item.querySelector('.crossedout-price')?.textContent);
			return [
				{
					externalId,
					name,
					price,
					listPrice: crossed ?? price,
					imageUrl: src && !src.startsWith('data:') ? new URL(src, BASE).toString() : null,
					url: new URL(href, BASE).toString(),
					brand: parseBrand(item)
				}
			];
		});
}

const pageUrl = (id: string, page: number) => `${SHOP}${id}${page > 0 ? `?page=${page}` : ''}`;

/** relative slug path ("Handwerkzeuge/c/60-00-00-00-00") from an href */
const categoryPath = (href: string) => href.match(/\/DE\/de\/hom\/(.+?\/c\/[^/?#"]+)/)?.[1] ?? null;

function parseTotal(html: string): number {
	const m = html.match(/([\d.]+)\s+Ergebnisse/);
	return m ? Number(m[1].replace(/\./g, '')) : 0;
}

/** child category tiles with their result counts */
function parseTiles(html: string): { id: string; name: string; count: number }[] {
	return parse(html)
		.querySelectorAll('li.categoryTile > a.categoryTileLink')
		.flatMap((a) => {
			const id = categoryPath(a.getAttribute('href') ?? '');
			const m = text(a.querySelector('.categoryTile-text')?.textContent).match(
				/^(.*)\s+\((\d+)\)$/
			);
			return id && m ? [{ id, name: m[1], count: Number(m[2]) }] : [];
		});
}

export const hoffmannDe: SiteScraper = {
	code: 'hoffmann_de',
	name: 'Hoffmann Group DE',
	baseUrl: SHOP,
	country: 'DE',
	currency: 'EUR',
	// robots.txt Crawl-delay: 5
	priceIncludesTax: true,
	delayMs: 5000,

	async categories(fetch) {
		const home = parse(await fetch(SHOP));
		const top = new Map<string, string>();
		for (const a of home.querySelectorAll('a[data-catid]')) {
			const id = categoryPath(a.getAttribute('href') ?? '');
			if (id && !top.has(id)) top.set(id, text(a.textContent) || id);
		}
		const result = new Map<string, string>();
		const visit = async (id: string, name: string, depth: number) => {
			const html = await fetch(pageUrl(id, 0));
			const tiles = parseTiles(html);
			if (tiles.length === 0 || parseTotal(html) < MAX_RESULTS || depth >= 4) {
				result.set(id, name);
				return;
			}
			for (const tile of tiles) {
				if (result.has(tile.id)) continue;
				if (tile.count > MAX_RESULTS) await visit(tile.id, tile.name, depth + 1);
				else result.set(tile.id, tile.name);
			}
		};
		for (const [id, name] of top) await visit(id, name, 0);
		return [...result].map(([id, name]) => ({ id, name }));
	},

	async *categoryPages(fetch, category: Category, maxPages) {
		const first = await fetch(pageUrl(category.id, 0));
		const pages = Math.min(
			Math.ceil(parseTotal(first) / PAGE_SIZE),
			MAX_RESULTS / PAGE_SIZE,
			maxPages
		);
		yield parseProducts(first);
		for (let page = 1; page < pages; page++) {
			const items = parseProducts(await fetch(pageUrl(category.id, page)));
			if (items.length === 0) break;
			yield items;
		}
	}
};
