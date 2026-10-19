import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { loadCart, totals } from "@/lib/cart";
import { newId } from "@/lib/ids";

const body = z.object({
  cartId: z.string().min(1),
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

  const sum = totals(cart.lines);
  const [order] = await db
    .insert(orders)
    .values({
      id: newId(),
      cartId: cart.id,
      customerId: cart.customerId,
      subtotalCents: sum.subtotalCents,
      taxCents: sum.taxCents,
      totalCents: sum.totalCents,
    })
    .onConflictDoNothing({ target: orders.cartId })
    .returning();
  if (!order) {
    return Response.json({ error: "This cart was already checked out" }, { status: 409 });
  }
  return Response.json({ orderId: order.id, totalCents: order.totalCents }, { status: 201 });
}
