ALTER TABLE "companies" ADD COLUMN "kind" text DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_personal_owner_idx" ON "companies" USING btree ("owner_user_id") WHERE kind = 'personal';