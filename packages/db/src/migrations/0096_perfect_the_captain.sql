ALTER TABLE "company_social_accounts" ADD COLUMN "needs_reauth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_social_accounts" ADD COLUMN "sync_error" text;