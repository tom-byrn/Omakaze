import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, carts, products } from "@/db/schema";
import { roundCents } from "./money";

export { formatMoney } from "./money";

export type CartLine = {
  productId: string;
  name: string;
  quantity: number;
  unitCents: number;
};

export type CartTotals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
};

/** Sales tax for the store's nexus (Austin, TX). */
export const TAX_RATE = 0.0825;

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

/** Store coupons reduce the taxable amount, so the discount comes off before tax. */
export function totals(lines: CartLine[], discountCents = 0): CartTotals {
  const subtotalCents = subtotal(lines);
  const taxable = Math.max(0, subtotalCents - discountCents);
  const taxCents = roundCents(taxable * TAX_RATE);
  return { subtotalCents, discountCents, taxCents, totalCents: taxable + taxCents };
}
