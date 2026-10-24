import { parse } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Category listing: /s/c-{id}/ then /s/c-{id}/page-{n}/?hits=90. robots.txt disallows
// "?disp=", "/?sort=" and "/?categoryCode=" URLs, so pagination uses only `hits`.
const BASE = 'https://www.navimro.com';

const absolute = (src: string) => new URL(src, BASE).toString();

function parsePrice(value: string | undefined): number | null {
	const digits = value?.replace(/[^\d]/g, '');
	return digits ? Number(digits) : null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	return parse(html)
		.querySelectorAll('li.item[data-g-code]')
		.flatMap((li) => {
			const externalId = li.getAttribute('data-g-code') ?? '';
			const name = li.getAttribute('data-item-title')?.trim() ?? '';
			if (!/^\d+$/.test(externalId) || !name) return [];

			const src = li.querySelector('img.grid-img')?.getAttribute('src');
			return [
				{
					externalId,
					name,
					// price excluding VAT; "원~" means the lowest price among variants
					price: parsePrice(li.querySelector('.sale__price:not(.vat_price) strong')?.textContent),
					listPrice: null,
					imageUrl: src ? absolute(src) : null,
					url: `${BASE}/g/${externalId}/`,
					brand: li.querySelector('a.item__brand')?.textContent.trim() || null
				}
			];
		});
}

function lastPage(html: string, categoryId: string): number {
	const pages = [...html.matchAll(new RegExp(`/s/${categoryId}/page-(\\d+)/`, 'g'))].map((m) =>
		Number(m[1])
	);
	return Math.max(1, ...pages);
}

export const navimro: SiteScraper = {
	code: 'navimro',
	name: '나비엠알오',
	baseUrl: BASE,
	country: 'KR',
	currency: 'KRW',
	// listing pages are ~2MB
	priceIncludesTax: false,
	delayMs: 2000,

	async categories(fetch) {
		const root = parse(await fetch(`${BASE}/k/map/`));
		const found = new Map<string, string>();
		for (const a of root.querySelectorAll('a[href*="/s/c-"]')) {
			// top-level categories have two-digit ids (c-10 … c-33)
			const id = a.getAttribute('href')!.match(/\/s\/(c-\d{2})\/?$/)?.[1];
			const name = a.textContent.replace(/\s+/g, ' ').trim();
			if (id && name && !found.has(id)) found.set(id, name);
		}
		return [...found].map(([id, name]) => ({ id, name }));
	},

	async *categoryPages(fetch, category: Category, maxPages, startPage = 1) {
		const first = await fetch(`${BASE}/s/${category.id}/`);
		const pages = Math.min(lastPage(first, category.id), maxPages);
		if (startPage <= 1) yield parseProducts(first);
		for (let page = Math.max(2, startPage); page <= pages; page++) {
			const items = parseProducts(await fetch(`${BASE}/s/${category.id}/page-${page}/?hits=90`));
			if (items.length === 0) break;
			yield items;
		}
	}
};
