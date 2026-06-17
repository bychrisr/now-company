ALTER TABLE "agent_runtime_state" ADD CONSTRAINT "agent_runtime_state_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_user_roles" ADD CONSTRAINT "instance_user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "goals_company_status_idx" ON "goals" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "projects_company_status_idx" ON "projects" USING btree ("company_id","status");