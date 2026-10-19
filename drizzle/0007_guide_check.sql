CREATE TABLE "guide_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text,
	"method" text,
	"check_run_id" bigint,
	"guide_id" text,
	"conclusion" text,
	"title" text,
	"summary" text,
	"details_url" text,
	"posted_at" timestamp with time zone,
	"error" text,
	"requests" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "guide_check" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "guide_check" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "guide_check_reviewers" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "guide_checks" ADD CONSTRAINT "guide_checks_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_checks" ADD CONSTRAINT "guide_checks_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guide_checks_repo_pr_unique" ON "guide_checks" USING btree ("repository_id","pr_number");