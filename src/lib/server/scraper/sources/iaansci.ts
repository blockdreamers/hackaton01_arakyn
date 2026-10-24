import { parse, type HTMLElement } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Cafe24 shop. Product list pages are allowed by robots.txt (/exec/front/ is not, so the
// category menu is read from the home page instead of the category API).
const BASE = 'https://iaansci.co.kr';
const PAGE_SIZE = 40;

const absolute = (src: string) => new URL(src, BASE).toString();
const text = (el: HTMLElement | null) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';

function parsePrice(value: string): number | null {
	const digits = value.replace(/[^\d]/g, '');
	return digits ? Number(digits) : null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	const root = parse(html);
	return root.querySelectorAll('ul.prdList > li.item').flatMap((li) => {
		const externalId = li.id.replace('anchorBoxId_', '');
		if (!/^\d+$/.test(externalId)) return [];

		// name link: label span is "상품명 :", the last span holds the name
		const spans = li.querySelectorAll('p.name a > span');
		const name = text(spans.at(-1) ?? null);

		const prices: Record<string, number | null> = {};
		for (const row of li.querySelectorAll('ul.xans-product-listitem > li')) {
			const label = text(row.querySelector('strong.title')).replace(/\s*:\s*$/, '');
			const value = row.querySelectorAll(':scope > span')[0];
			if (label) prices[label] = parsePrice(text(value));
		}

		const img = li.querySelector('p.prdImg img');
		return [
			{
				externalId,
				name,
				price: prices['판매가'] ?? null,
				listPrice: prices['소비자가'] ?? null,
				imageUrl: img?.getAttribute('src') ? absolute(img.getAttribute('src')!) : null,
				url: `${BASE}/product/detail.html?product_no=${externalId}`
			}
		];
	});
}

function parseTotal(html: string): number {
	const m = html.match(/class="prdCount"[^>]*>[^<]*<strong>([\d,]+)/);
	return m ? Number(m[1].replace(/,/g, '')) : 0;
}

export const iaansci: SiteScraper = {
	code: 'iaansci',
	name: '이안과학',
	baseUrl: BASE,
	country: 'KR',
	currency: 'KRW',
	priceIncludesTax: true,
	delayMs: 1000,

	async categories(fetch) {
		const root = parse(await fetch(`${BASE}/`));
		const found = new Map<string, string>();
		for (const a of root.querySelectorAll('a[href^="/product/list.html?cate_no="]')) {
			const id = a.getAttribute('href')!.match(/cate_no=(\d+)/)?.[1];
			const name = text(a);
			if (id && name && !found.has(id)) found.set(id, name);
		}
		return [...found].map(([id, name]) => ({ id, name }));
	},

	async *categoryPages(fetch, category: Category, maxPages, startPage = 1) {
		const url = (page: number) => `${BASE}/product/list.html?cate_no=${category.id}&page=${page}`;
		const first = await fetch(url(1));
		const pages = Math.min(Math.ceil(parseTotal(first) / PAGE_SIZE), maxPages);
		if (startPage <= 1) yield parseProducts(first);
		for (let page = Math.max(2, startPage); page <= pages; page++) {
			const items = parseProducts(await fetch(url(page)));
			if (items.length === 0) break;
			yield items;
		}
	}
};
