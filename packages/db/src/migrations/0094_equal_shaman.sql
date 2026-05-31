CREATE TABLE "social_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"copy_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"icon_url" text,
	"description" text,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_platforms_slug_uq" ON "social_platforms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "social_platforms_status_sort_idx" ON "social_platforms" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "social_platforms_category_idx" ON "social_platforms" USING btree ("category");