export interface ScrapedProduct {
	externalId: string;
	name: string;
	price: number | null;
	listPrice: number | null;
	imageUrl: string | null;
	url: string;
}

export interface Category {
	id: string;
	name: string;
}

export interface Fetcher {
	(url: string): Promise<string>;
}

export interface SiteScraper {
	code: string;
	name: string;
	baseUrl: string;
	country: string;
	currency: string;
	categories(fetch: Fetcher): Promise<Category[]>;
	/** Yields one page of products at a time */
	categoryPages(fetch: Fetcher, category: Category): AsyncGenerator<ScrapedProduct[]>;
}
