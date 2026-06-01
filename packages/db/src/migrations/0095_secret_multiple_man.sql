CREATE TABLE "company_social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"secret_id" uuid,
	"handle" text NOT NULL,
	"display_name" text,
	"profile_url" text,
	"platform_account_id" text,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"avg_engagement_rate" numeric(5, 4),
	"last_synced_at" timestamp with time zone,
	"default_hashtags" text[] DEFAULT '{}' NOT NULL,
	"default_cta" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_platforms" ALTER COLUMN "image_specs" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "company_social_accounts" ADD CONSTRAINT "company_social_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_social_accounts" ADD CONSTRAINT "company_social_accounts_platform_id_social_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."social_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_social_accounts" ADD CONSTRAINT "company_social_accounts_secret_id_company_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_social_accounts_company_platform_account_uq" ON "company_social_accounts" USING btree ("company_id","platform_id","platform_account_id");--> statement-breakpoint
CREATE INDEX "company_social_accounts_company_active_idx" ON "company_social_accounts" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "company_social_accounts_company_platform_idx" ON "company_social_accounts" USING btree ("company_id","platform_id");--> statement-breakpoint
CREATE INDEX "company_social_accounts_secret_idx" ON "company_social_accounts" USING btree ("secret_id");