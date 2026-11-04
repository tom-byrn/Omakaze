ALTER TABLE "guides" ADD COLUMN "ai_reviews" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "wait_for_ai_reviewers" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_reviewer_wait_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_reviewers" jsonb;