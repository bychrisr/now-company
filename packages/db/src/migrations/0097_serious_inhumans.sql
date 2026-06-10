ALTER TABLE "social_platforms" ADD COLUMN "oauth_app_id" text;--> statement-breakpoint
ALTER TABLE "social_platforms" ADD COLUMN "oauth_app_secret_enc" text;--> statement-breakpoint
ALTER TABLE "social_platforms" ADD COLUMN "oauth_redirect_uri" text;--> statement-breakpoint
ALTER TABLE "social_platforms" ADD COLUMN "implementation_status" text DEFAULT 'not_implemented' NOT NULL;