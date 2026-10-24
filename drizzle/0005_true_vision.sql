CREATE TABLE "monitor_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"report" text NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_code" text NOT NULL,
	"kind" text NOT NULL,
	"ok" boolean NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_checks_site_code_kind_created_at_index" ON "site_checks" USING btree ("site_code","kind","created_at");