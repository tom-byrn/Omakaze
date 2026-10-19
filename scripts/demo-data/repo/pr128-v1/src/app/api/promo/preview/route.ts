import { z } from "zod";
import { loadCart } from "@/lib/cart";
import { PROMO_MESSAGES, validatePromo } from "@/lib/promo";

const body = z.object({
  cartId: z.string().min(1),
  code: z.string().trim().min(1).max(40),
});

/** Check a code without redeeming it, so the cart can show the discount before checkout. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a code" }, { status: 400 });

  const cart = await loadCart(parsed.data.cartId);
  if (!cart) return Response.json({ error: "Cart not found" }, { status: 404 });

  const result = await validatePromo(parsed.data.code, cart.lines);
  if (!result.ok) {
    return Response.json({ error: PROMO_MESSAGES[result.reason], code: result.reason }, { status: 422 });
  }
  return Response.json({ code: result.promo.code, discountCents: result.discountCents });
}
