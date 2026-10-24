import {
	pgTable,
	serial,
	text,
	integer,
	timestamp,
	char,
	numeric,
	boolean,
	unique,
	index,
	jsonb
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	googleSub: text('google_sub').notNull().unique(),
	email: text('email').notNull(),
	name: text('name'),
	picture: text('picture'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	// sha256 of the session token stored in the cookie
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export type User = typeof users.$inferSelect;

// Shops we scrape. Country/currency make the catalog work across countries.
export const sites = pgTable('sites', {
	id: serial('id').primaryKey(),
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	baseUrl: text('base_url').notNull(),
	// ISO 3166-1 alpha-2, e.g. KR
	country: char('country', { length: 2 }).notNull(),
	// ISO 4217, e.g. KRW
	currency: char('currency', { length: 3 }).notNull()
});

export const products = pgTable(
	'products',
	{
		id: serial('id').primaryKey(),
		siteId: integer('site_id')
			.notNull()
			.references(() => sites.id, { onDelete: 'cascade' }),
		// product id on the source site
		externalId: text('external_id').notNull(),
		name: text('name').notNull(),
		// in the site's currency, minor units not used (KRW has none)
		price: numeric('price', { precision: 14, scale: 2, mode: 'number' }),
		listPrice: numeric('list_price', { precision: 14, scale: 2, mode: 'number' }),
		imageUrl: text('image_url'),
		url: text('url').notNull(),
		categories: text('categories').array().notNull().default([]),
		brand: text('brand'),
		rating: numeric('rating', { precision: 3, scale: 2, mode: 'number' }),
		reviewsCount: integer('reviews_count'),
		description: text('description'),
		// search keywords that found the product (keyword-based sources)
		keywords: text('keywords').array().notNull().default([]),
		// full source record, for fields we don't map to columns
		raw: jsonb('raw'),
		// false once a full scrape no longer finds the product
		active: boolean('active').notNull().default(true),
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique().on(t.siteId, t.externalId), index().on(t.siteId, t.active)]
);

export const scrapeRuns = pgTable('scrape_runs', {
	id: serial('id').primaryKey(),
	siteId: integer('site_id')
		.notNull()
		.references(() => sites.id, { onDelete: 'cascade' }),
	status: text('status', { enum: ['running', 'succeeded', 'failed'] }).notNull(),
	// job id at an external provider (e.g. Bright Data snapshot id)
	externalJobId: text('external_job_id'),
	input: jsonb('input'),
	pagesFetched: integer('pages_fetched').notNull().default(0),
	productsFound: integer('products_found').notNull().default(0),
	error: text('error'),
	startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	finishedAt: timestamp('finished_at', { withTimezone: true })
});

export type Site = typeof sites.$inferSelect;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;

export const apiKeys = pgTable('api_keys', {
	id: serial('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	// sha256 of the key; the key itself is shown once when issued
	keyHash: text('key_hash').notNull().unique(),
	// first characters of the key, for display
	prefix: text('prefix').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
	revokedAt: timestamp('revoked_at', { withTimezone: true })
});

export const apiRequests = pgTable(
	'api_requests',
	{
		id: serial('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		apiKeyId: integer('api_key_id')
			.notNull()
			.references(() => apiKeys.id, { onDelete: 'cascade' }),
		method: text('method').notNull(),
		path: text('path').notNull(),
		query: text('query'),
		status: integer('status').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index().on(t.userId, t.createdAt)]
);
