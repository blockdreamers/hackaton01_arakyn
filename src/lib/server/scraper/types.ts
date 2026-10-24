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
}

export interface SiteScraper {
	code: string;
	name: string;
	baseUrl: string;
	country: string;
	currency: string;
	/** minimum delay between requests */
	delayMs: number;
	categories(fetch: Fetcher): Promise<Category[]>;
	/** Yields one page of products at a time */
	categoryPages(
		fetch: Fetcher,
		category: Category,
		maxPages: number
	): AsyncGenerator<ScrapedProduct[]>;
}
