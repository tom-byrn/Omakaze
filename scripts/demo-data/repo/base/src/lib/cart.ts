import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, products } from "@/db/schema";

export type CartLine = {
  productId: string;
  name: string;
  quantity: number;
  unitCents: number;
};

export type CartTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

/** Sales tax for the store's nexus (Austin, TX). */
export const TAX_RATE = 0.0825;

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON);
}

export async function loadCart(cartId: string) {
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1);
  if (!cart) return null;
  const lines: CartLine[] = await db
    .select({
      productId: products.id,
      name: products.name,
      quantity: cartItems.quantity,
      unitCents: products.priceCents,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId));
  return { ...cart, lines };
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
}

export function totals(lines: CartLine[]): CartTotals {
  const subtotalCents = subtotal(lines);
  const taxCents = roundCents(subtotalCents * TAX_RATE);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
