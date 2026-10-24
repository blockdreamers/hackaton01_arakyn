ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reviews_count" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "external_job_id" text;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "input" jsonb;