import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    stock: integer("stock").default(0).notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_slug_unique").on(t.slug)],
);

export const carts = pgTable("carts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  currency: text("currency").default("USD").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.productId] })],
);

export type PromoKind = "percent" | "fixed";

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    kind: text("kind").$type<PromoKind>().notNull(),
    /** Percent off (1-100) or a fixed amount in cents, depending on `kind`. */
    amount: integer("amount").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").default(0).notNull(),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").default(0).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("promo_codes_code_unique").on(sql`lower(${t.code})`),
    check("promo_codes_kind_check", sql`${t.kind} in ('percent', 'fixed')`),
    check("promo_codes_amount_check", sql`${t.amount} > 0`),
  ],
);

export type OrderStatus = "pending" | "paid" | "cancelled";

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id),
    customerId: text("customer_id"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").default(0).notNull(),
    promoCodeId: text("promo_code_id").references(() => promoCodes.id),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: text("status").$type<OrderStatus>().default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("orders_cart_unique").on(t.cartId)],
);

export const wishlists = pgTable("wishlists", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  name: text("name").default("Wishlist").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
