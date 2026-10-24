CREATE TABLE "agent_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address" text NOT NULL,
	"chain" text DEFAULT 'base-sepolia' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_wallets_user_id_address_unique" UNIQUE("user_id","address")
);
--> statement-breakpoint
ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;