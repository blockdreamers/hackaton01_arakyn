import { parse } from 'node-html-parser';
import type { Category, Fetcher, ScrapedProduct, SiteScraper } from '../types.ts';

// Uline (US). robots.txt for `*` only blocks account/checkout/error paths and has no
// crawl-delay (the Cls_/Grp_/BL_ blocks apply to the img2dataset bot only).
// Hierarchy: /Cls_{id} (top category) -> /Grp_{id} (group, may nest) -> /BL_{id} (product
// line). A BL page is one complete price chart (no pagination); each one is yielded as a
// "page". Chart rows are mirrored in inline `dataProductInformation.push({...})` calls.
const BASE = 'https://www.uline.com';
const MAX_GROUP_DEPTH = 3;

const decode = (s: string) => parse(s).textContent.replace(/\s+/g, ' ').trim();

// "Pelican&trade; 1200 Equipment Case" -> "Pelican"
function brandOf(name: string): string | null {
	if (/^Uline\b/.test(name)) return 'Uline';
	return name.match(/^([A-Z0-9][\w&'.-]*(?: [A-Z0-9][\w&'.-]*)?)[™®]/)?.[1] ?? null;
}

export function parseProducts(html: string): ScrapedProduct[] {
	// all items on a BL page share the product-line photo
	const image =
		html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ??
		html.match(/class="itemResultImage"[^>]*src='([^']+)'/)?.[1];
	const links = new Map(
		[...html.matchAll(/href='(\/Product\/Detail\/([^/']+)\/[^']*)'/g)].map((m) => [m[2], m[1]])
	);

	const seen = new Set<string>();
	const products: ScrapedProduct[] = [];
	for (const m of html.matchAll(/dataProductInformation\.push\(\{(.*?)\}\);/g)) {
		const fields = Object.fromEntries(
			[...m[1].matchAll(/'(\w+)':\s*'((?:[^'\\]|\\.)*)'/g)].map((f) => [
				f[1],
				f[2].replace(/\\(.)/g, '$1')
			])
		);
		const externalId = fields.ItemNumber?.trim();
		const name = decode(fields.Description ?? '');
		if (!externalId || !name || seen.has(externalId)) continue;
		seen.add(externalId);

		// UnitPrice is the per-unit price at the smallest quantity tier (highest tier price)
		const value = Number(fields.UnitPrice);
		const price = Number.isFinite(value) && value > 0 ? value : null;
		const path = links.get(externalId) ?? `/Product/Detail/${encodeURIComponent(externalId)}`;
		products.push({
			externalId,
			name,
			price,
			listPrice: price,
			imageUrl: image ? new URL(image, BASE).toString() : null,
			url: new URL(path, BASE).toString(),
			brand: brandOf(name)
		});
	}
	return products;
}

/** Content links to groups/product lines; nav links carry a `?dup=` tracking param */
function childLinks(html: string): { groups: string[]; lines: string[] } {
	const groups = new Set<string>();
	const lines = new Set<string>();
	for (const m of html.matchAll(/href=["'](\/(Grp|BL)_[^"'?#\s]+)(\?[^"']*)?["']/g)) {
		if (m[3]?.includes('dup=')) continue;
		(m[2] === 'Grp' ? groups : lines).add(m[1]);
	}
	return { groups: [...groups], lines: [...lines] };
}

const pathKey = (path: string) => path.split('/')[1].toLowerCase();

async function tryFetch(fetch: Fetcher, path: string): Promise<string | null> {
	try {
		return await fetch(`${BASE}${path}`);
	} catch {
		// a single dead product line shouldn't abort the whole category
		return null;
	}
}

export const uline: SiteScraper = {
	code: 'uline',
	name: 'Uline',
	baseUrl: BASE,
	country: 'US',
	currency: 'USD',
	// no crawl-delay in robots.txt; product line pages can be ~1MB
	priceIncludesTax: false,
	delayMs: 2000,

	async categories(fetch) {
		const html = await fetch(`${BASE}/`);
		const found = new Map<string, string>();
		// "Products" menu; skip Cls_Custom / Cls_shipping (custom quotes / cross-category hub)
		for (const m of html.matchAll(/href='\/Cls_(\d+)\/[^'?]*\?dup=products'>([^<]+)/g)) {
			const name = decode(m[2]);
			if (name && !found.has(m[1])) found.set(m[1], name);
		}
		return [...found].map(([id, name]) => ({ id, name }));
	},

	async *categoryPages(fetch, category: Category, maxPages) {
		const visited = new Set<string>();
		const seenItems = new Set<string>();
		let pages = 0;

		// depth-first so that small maxPages values don't require discovering every group
		async function* walk(html: string, depth: number): AsyncGenerator<ScrapedProduct[]> {
			if (pages >= maxPages) return;
			const items = parseProducts(html).filter((p) => !seenItems.has(p.externalId));
			if (items.length > 0) {
				items.forEach((p) => seenItems.add(p.externalId));
				pages++;
				yield items;
			}
			const { groups, lines } = childLinks(html);
			for (const path of lines) {
				if (pages >= maxPages) return;
				if (visited.has(pathKey(path))) continue;
				visited.add(pathKey(path));
				const page = await tryFetch(fetch, path);
				if (!page) continue;
				const found = parseProducts(page).filter((p) => !seenItems.has(p.externalId));
				if (found.length === 0) continue;
				found.forEach((p) => seenItems.add(p.externalId));
				pages++;
				yield found;
			}
			if (depth >= MAX_GROUP_DEPTH) return;
			for (const path of groups) {
				if (pages >= maxPages) return;
				if (visited.has(pathKey(path))) continue;
				visited.add(pathKey(path));
				const page = await tryFetch(fetch, path);
				if (page) yield* walk(page, depth + 1);
			}
		}

		yield* walk(await fetch(`${BASE}/Cls_${category.id}`), 0);
	}
};
