import { integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  /** Set while the list is shared; anyone with the token can view it. */
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
