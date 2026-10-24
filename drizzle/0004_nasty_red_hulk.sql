ALTER TABLE "scrape_runs" ADD COLUMN "progress" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "price_includes_tax" boolean;