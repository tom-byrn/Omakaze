ALTER TABLE "guides" ADD COLUMN "template" jsonb;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "guide_template" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "guide_template" jsonb;