ALTER TABLE "pull_requests" ADD COLUMN "requested_reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "requested_teams" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "assignees" jsonb DEFAULT '[]'::jsonb NOT NULL;