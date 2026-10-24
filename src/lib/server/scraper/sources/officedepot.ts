import { parse } from 'node-html-parser';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Office Depot Korea. robots.txt has no rules for generic bots (named bots may not crawl
// MallDisplay.do, which we don't use). Listing: /cate/cateItemList.do, 60 items per page.
const BASE = 'https://www.officedepot.co.kr';
const PAGE_SIZE = 60;

const text = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim() ?? '';

function parsePrice(value: string | undefined): number | null {
	const digits = value?.replace(/[^\d]/g, '');
	return digits ? Number(digits) : null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	return parse(html)
		.querySelectorAll('li.item > ul.goods_content')
		.flatMap((ul) => {
			const link = ul.querySelector('li.goods_md > a');
			const externalId = link?.getAttribute('href')?.match(/itemId=(\d+)/)?.[1];
			const name = text(link?.textContent);
			if (!externalId || !name) return [];

			const src = ul.querySelector('li.goods_img img')?.getAttribute('src');
			// discounted items show the original price in <strike>
			const price = parsePrice(ul.querySelector('li.goods_bm .price strong')?.textContent);
			const original = parsePrice(ul.querySelector('li.goods_bm strike')?.textContent);
			return [
				{
					externalId,
					name,
					price,
					listPrice: original ?? price,
					imageUrl: src ? new URL(src.replace('.kr//', '.kr/'), BASE).toString() : null,
					url: `${BASE}/item/itemView.do?itemId=${externalId}`,
					// brand is prefixed with a seller code, e.g. "(100914B)정우엠알오"
					brand:
						text(ul.querySelector('li.goods_md > span.brand')?.textContent).replace(
							/^\([^)]*\)\s*/,
							''
						) || null
				}
			];
		});
}

const listUrl = (id: string, page: number) =>
	`${BASE}/cate/cateItemList.do?cateId=${id}&rowLevel=1&currentPageNo=${page}`;

function parseTotal(html: string): number {
	const m = html.match(/([\d,]+)\s*<\/strong>\s*개\s*상품/);
	return m ? Number(m[1].replace(/,/g, '')) : 0;
}

export const officedepot: SiteScraper = {
	code: 'officedepot',
	name: '오피스디포',
	baseUrl: BASE,
	country: 'KR',
	currency: 'KRW',
	// listing pages are ~500KB
	delayMs: 1500,

	async categories(fetch) {
		const html = await fetch(`${BASE}/main/mainView.do`);
		const ids = [
			...new Set([...html.matchAll(/cateItemList\.do\?cateId=(\d+)&rowLevel=1"/g)].map((m) => m[1]))
		];
		// menu links have no names ("카테고리 바로가기"), so read each category's page title
		const categories: Category[] = [];
		for (const id of ids) {
			const title = parse(await fetch(listUrl(id, 1))).querySelector('title')?.textContent ?? id;
			categories.push({ id, name: text(title.split('|')[0].split('>')[0]) || id });
		}
		return categories;
	},

	async *categoryPages(fetch, category: Category, maxPages) {
		const first = await fetch(listUrl(category.id, 1));
		const pages = Math.min(Math.ceil(parseTotal(first) / PAGE_SIZE), maxPages);
		yield parseProducts(first);
		for (let page = 2; page <= pages; page++) {
			const items = parseProducts(await fetch(listUrl(category.id, page)));
			if (items.length === 0) break;
			yield items;
		}
	}
};
