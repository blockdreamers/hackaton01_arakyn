import { mroJa, mroKo } from '../keywords/mro.ts';
import type { Category, ScrapedProduct, SiteScraper } from '../types.ts';

// Daiso product search through the public daiso-mcp REST API (https://mcp.aka.page,
// https://github.com/hmmhmmhm/daiso-mcp). Shared free service: slow pace, few pages per keyword.
const API = 'https://mcp.aka.page/api';
const DEFAULT_MAX_PAGES = 3;

const keywords = (list: string[]): Category[] => list.map((k) => ({ id: k, name: k }));

interface DaisoProduct {
	id: string;
	name: string;
	price: number | null;
	imageUrl?: string | null;
	url?: string | null;
}

interface SearchResponse {
	success: boolean;
	data: { products: DaisoProduct[]; hasNext?: boolean };
	meta?: { total: number; page: number; pageSize: number };
}

async function search(fetch: (url: string) => Promise<string>, url: string) {
	const res = JSON.parse(await fetch(url)) as SearchResponse;
	if (!res.success) throw new Error(`daiso-mcp error for ${url}`);
	return res;
}

const toProduct = (p: DaisoProduct, url: string): ScrapedProduct => ({
	externalId: String(p.id),
	name: p.name.trim(),
	price: typeof p.price === 'number' ? p.price : null,
	listPrice: null,
	imageUrl: p.imageUrl || null,
	url
});

export const daiso: SiteScraper = {
	code: 'daiso',
	name: '다이소',
	baseUrl: 'https://www.daisomall.co.kr',
	country: 'KR',
	currency: 'KRW',
	crawlBaseUrl: 'https://mcp.aka.page',
	priceIncludesTax: true,
	delayMs: 2000,
	groups: 'keywords',

	async categories() {
		return keywords(mroKo);
	},

	async *categoryPages(fetch, keyword, maxPages) {
		const pageSize = 100;
		const pages = Math.min(maxPages, DEFAULT_MAX_PAGES);
		for (let page = 1; page <= pages; page++) {
			const q = new URLSearchParams({
				q: keyword.id,
				page: String(page),
				pageSize: String(pageSize)
			});
			const res = await search(fetch, `${API}/daiso/products?${q}`);
			yield res.data.products.map((p) =>
				toProduct(p, `https://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=${p.id}`)
			);
			if (!res.meta || page * pageSize >= res.meta.total) break;
		}
	}
};

export const daisoJp: SiteScraper = {
	code: 'daiso_jp',
	name: 'DAISO Japan',
	baseUrl: 'https://jp.daisonet.com',
	country: 'JP',
	currency: 'JPY',
	crawlBaseUrl: 'https://mcp.aka.page',
	priceIncludesTax: true,
	delayMs: 2000,
	groups: 'keywords',

	async categories() {
		return keywords(mroJa);
	},

	async *categoryPages(fetch, keyword, maxPages) {
		const pages = Math.min(maxPages, DEFAULT_MAX_PAGES);
		for (let page = 1; page <= pages; page++) {
			const q = new URLSearchParams({ q: keyword.id, page: String(page) });
			const res = await search(fetch, `${API}/daiso-jp/products?${q}`);
			yield res.data.products.map((p) =>
				toProduct(p, p.url || `https://jp.daisonet.com/products/${p.id}`)
			);
			if (!res.data.hasNext) break;
		}
	}
};
