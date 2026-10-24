CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(14, 2),
	"list_price" numeric(14, 2),
	"image_url" text,
	"url" text NOT NULL,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_site_id_external_id_unique" UNIQUE("site_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"status" text NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"products_found" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"country" char(2) NOT NULL,
	"currency" char(3) NOT NULL,
	CONSTRAINT "sites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_site_id_active_index" ON "products" USING btree ("site_id","active");