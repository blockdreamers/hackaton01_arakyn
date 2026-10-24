import { BrightData } from './client.ts';

// "Amazon products - discover by keyword"
export const DATASET_ID = 'gd_l7q7dkf244hwjntr0';

export const amazonUs = {
	code: 'amazon_us',
	name: 'Amazon.com',
	baseUrl: 'https://www.amazon.com',
	country: 'US',
	currency: 'USD'
};

export function triggerKeywordDiscovery(
	bd: BrightData,
	keywords: string[],
	{ limitPerInput, maxTotal }: { limitPerInput: number; maxTotal: number }
) {
	return bd.trigger(
		{
			dataset_id: DATASET_ID,
			type: 'discover_new',
			discover_by: 'keyword',
			// hard cap on billed records across all keywords
			limit_multiple_results: String(maxTotal)
		},
		{ input: keywords.map((keyword) => ({ keyword })), limit_per_input: limitPerInput }
	);
}

type AmazonRecord = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
function num(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const n = Number(v.replace(/[^\d.]/g, ''));
		return v.match(/\d/) && Number.isFinite(n) ? n : null;
	}
	return null;
}
const first = (r: AmazonRecord, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v != null);

/** Maps a Bright Data Amazon record to product columns; null for error rows */
export function mapRecord(r: AmazonRecord) {
	const asin = str(r.asin);
	const name = str(r.title);
	if (!asin || !name) return null;

	const categories = Array.isArray(r.categories)
		? r.categories.filter((c): c is string => typeof c === 'string')
		: str(r.category)
			? [str(r.category)!]
			: [];
	const input = (r.discovery_input ?? r.input) as { keyword?: string } | undefined;
	const keyword = str(r.keyword) ?? str(input?.keyword);

	return {
		externalId: asin,
		name,
		price: num(first(r, 'final_price', 'price')),
		listPrice: num(first(r, 'initial_price')),
		imageUrl: str(first(r, 'image_url', 'main_image', 'image')),
		url: str(r.url) ?? `https://www.amazon.com/dp/${asin}`,
		categories,
		brand: str(r.brand),
		rating: num(r.rating),
		reviewsCount: num(r.reviews_count),
		description: str(r.description),
		keywords: keyword ? [keyword] : [],
		raw: r
	};
}
