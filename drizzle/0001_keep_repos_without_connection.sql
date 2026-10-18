ALTER TABLE "repositories" DROP CONSTRAINT "repositories_connection_id_github_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE set null ON UPDATE no action;