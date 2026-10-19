ALTER TABLE "guide_views" ADD COLUMN "previous_visit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "section_reviews" ADD COLUMN "carried_from_version" integer;