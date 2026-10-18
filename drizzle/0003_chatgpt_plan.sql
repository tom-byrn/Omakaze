CREATE TABLE "chatgpt_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"id_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text NOT NULL,
	"model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "allow_chatgpt_plans" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chatgpt_connections" ADD CONSTRAINT "chatgpt_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatgpt_connections_user_unique" ON "chatgpt_connections" USING btree ("user_id");