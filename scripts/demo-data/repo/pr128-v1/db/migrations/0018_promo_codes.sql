CREATE TABLE "promo_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "kind" text NOT NULL,
  "amount" integer NOT NULL,
  "min_subtotal_cents" integer DEFAULT 0 NOT NULL,
  "max_redemptions" integer,
  "redemptions" integer DEFAULT 0 NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "promo_codes_kind_check" CHECK ("kind" in ('percent', 'fixed')),
  CONSTRAINT "promo_codes_amount_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" (lower("code"));
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code_id" text REFERENCES "promo_codes"("id");
