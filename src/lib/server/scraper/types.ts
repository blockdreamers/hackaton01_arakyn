export interface ScrapedProduct {
	externalId: string;
	name: string;
	price: number | null;
	listPrice: number | null;
	imageUrl: string | null;
	url: string;
	brand?: string | null;
}

export interface Category {
	id: string;
	name: string;
}

export interface Fetcher {
	(url: string): Promise<string>;
}

export interface ScrapeOptions {
	/** only these category ids (default: all) */
	categories?: string[];
	/** stop each category after this many pages (default: all) */
	maxPages?: number;
	/** continue a stopped run: skip its finished categories, resume its last page */
	resumeRunId?: number;
}

export interface SiteScraper {
	code: string;
	name: string;
	baseUrl: string;
	country: string;
	currency: string;
	/** host we actually request (default: baseUrl), e.g. an API in front of the shop */
	crawlBaseUrl?: string;
	/** whether prices include VAT / sales tax */
	priceIncludesTax: boolean;
	/** minimum delay between requests */
	delayMs: number;
	/**
	 * 'keywords' for search-based sources: groups are search keywords (stored in
	 * products.keywords) and a run never covers the whole site
	 */
	groups?: 'categories' | 'keywords';
	categories(fetch: Fetcher): Promise<Category[]>;
	/**
	 * Yields one page of products at a time. Sources that support it start at `startPage`
	 * (1-based); others restart the category from its first page.
	 */
	categoryPages(
		fetch: Fetcher,
		category: Category,
		maxPages: number,
		startPage?: number
	): AsyncGenerator<ScrapedProduct[]>;
}
