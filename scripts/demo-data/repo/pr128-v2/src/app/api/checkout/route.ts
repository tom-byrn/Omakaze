import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, promoCodes } from "@/db/schema";
import { loadCart, totals } from "@/lib/cart";
import { newId } from "@/lib/ids";
import { PROMO_MESSAGES, validatePromo } from "@/lib/promo";

const body = z.object({
  cartId: z.string().min(1),
  promoCode: z.string().trim().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const cart = await loadCart(parsed.data.cartId);
  if (!cart || cart.lines.length === 0) {
    return Response.json({ error: "Your cart is empty" }, { status: 409 });
  }

  let promoId: string | null = null;
  let discountCents = 0;
  if (parsed.data.promoCode) {
    const result = await validatePromo(parsed.data.promoCode, cart.lines);
    if (!result.ok) {
      return Response.json({ error: PROMO_MESSAGES[result.reason], code: result.reason }, { status: 422 });
    }
    promoId = result.promo.id;
    discountCents = result.discountCents;
  }

  const sum = totals(cart.lines, discountCents);
  const order = await db.transaction(async (tx) => {
    if (promoId) {
      // Count the redemption in the same transaction, so two carts can't both take the last use.
      const claimed = await tx
        .update(promoCodes)
        .set({ redemptions: sql`${promoCodes.redemptions} + 1` })
        .where(
          sql`${promoCodes.id} = ${promoId} and (${promoCodes.maxRedemptions} is null or ${promoCodes.redemptions} < ${promoCodes.maxRedemptions})`,
        )
        .returning({ id: promoCodes.id });
      // Another order took the last use between validatePromo() and here.
      if (claimed.length === 0) return "used_up" as const;
    }
    const [row] = await tx
      .insert(orders)
      .values({
        id: newId(),
        cartId: cart.id,
        customerId: cart.customerId,
        subtotalCents: sum.subtotalCents,
        discountCents: sum.discountCents,
        promoCodeId: promoId,
        taxCents: sum.taxCents,
        totalCents: sum.totalCents,
      })
      .onConflictDoNothing({ target: orders.cartId })
      .returning();
    return row ?? null;
  });
  if (order === "used_up") {
    return Response.json({ error: PROMO_MESSAGES.used_up, code: "used_up" }, { status: 422 });
  }
  if (!order) {
    return Response.json({ error: "This cart was already checked out" }, { status: 409 });
  }
  return Response.json(
    { orderId: order.id, discountCents: order.discountCents, totalCents: order.totalCents },
    { status: 201 },
  );
}
