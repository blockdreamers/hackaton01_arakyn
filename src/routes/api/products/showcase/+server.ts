// ~300 real products for the rolling showcase on the home page: a random mix across all sites,
// only rows with an image and a price. Read-only; cached briefly so page loads don't hit the DB.
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

interface Item {
	id: number;
	name: string;
	price: number;
	currency: string;
	image: string;
	url: string;
	site: string;
	dims: string[];
}

// Pull the measurements a buyer scans for out of the product name: 10x17cm, 5mm, 12V, 240W, 500ml…
const DIM_RE =
	/(\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm|m\b|in\b|"|')|\d+(?:\.\d+)?\s*(?:mm|cm|m|ml|mL|L|kg|g|V|W|A|mAh|Φ|파이|인치|inch|")(?![a-zA-Z]))/g;

function dims(name: string) {
	return [
		...new Set(
			name
				.normalize('NFKC')
				.match(DIM_RE)
				?.map((d) => d.replace(/\s+/g, '')) ?? []
		)
	].slice(0, 3);
}

let cache: { at: number; items: Item[] } | null = null;

export const GET: RequestHandler = async () => {
	if (cache && Date.now() - cache.at < 5 * 60_000) return json(cache.items);
	// a few random rows per site so every source shows up
	const rows = await db.execute<{
		id: number;
		name: string;
		price: string;
		currency: string;
		image_url: string;
		url: string;
		site: string;
	}>(sql`
		select id, name, price, currency, image_url, url, site from (
			select p.id, p.name, p.price, s.currency, p.image_url, p.url, s.code as site,
				row_number() over (partition by p.site_id order by random()) as rn
			from products p join sites s on s.id = p.site_id
			where p.active and p.image_url is not null and p.price > 0
		) t
		where rn <= 80
		order by random()
		limit 300
	`);
	const items = [...rows].map((r) => ({
		id: r.id,
		name: r.name,
		price: Number(r.price),
		currency: r.currency.trim(),
		image: r.image_url,
		url: r.url,
		site: r.site,
		dims: dims(r.name)
	}));
	cache = { at: Date.now(), items };
	return json(items);
};
