ALTER TABLE "guides" ADD COLUMN "ai_source" text;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "changed_lines" integer;--> statement-breakpoint
ALTER TABLE "guides" ADD COLUMN "covered_lines" integer;--> statement-breakpoint
CREATE INDEX "comments_workspace_created_idx" ON "comments" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "guides_workspace_created_idx" ON "guides" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "guides_workspace_published_idx" ON "guides" USING btree ("workspace_id","published_at");--> statement-breakpoint
-- Built-in AI guides written before ai_source existed: a guide whose model is the model of its creator's ChatGPT connection, in a workspace that allows plans, was written on that plan. Others stay unknown (null).
UPDATE "guides" AS g SET "ai_source" = 'chatgpt' FROM "chatgpt_connections" AS c, "workspaces" AS w WHERE g."source" = 'ai' AND g."ai_source" IS NULL AND c."user_id" = g."created_by_user_id" AND w."id" = g."workspace_id" AND w."allow_chatgpt_plans" AND c."model" = g."author";
