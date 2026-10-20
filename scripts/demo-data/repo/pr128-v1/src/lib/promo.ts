import { sql } from "drizzle-orm";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { subtotal, type CartLine } from "./cart";
import { percentOf } from "./money";

export type PromoCode = typeof promoCodes.$inferSelect;

export type PromoError = "not_found" | "not_started" | "expired" | "min_subtotal" | "used_up";

export type PromoResult =
  | { ok: true; promo: PromoCode; discountCents: number }
  | { ok: false; reason: PromoError };

export const PROMO_MESSAGES: Record<PromoError, string> = {
  not_found: "This code doesn't exist.",
  not_started: "This code isn't active yet.",
  expired: "This code has expired.",
  min_subtotal: "Your cart is below the minimum for this code.",
  used_up: "This code has been fully redeemed.",
};

export async function findPromo(code: string): Promise<PromoCode | null> {
  const [row] = await db
    .select()
    .from(promoCodes)
    .where(sql`${promoCodes.code} = ${code.trim()}`)
    .limit(1);
  return row ?? null;
}

/** Check a code against a cart. Everything but the lookup is pure, so it is easy to test. */
export function checkPromo(promo: PromoCode | null, lines: CartLine[], now = new Date()): PromoResult {
  if (!promo) return { ok: false, reason: "not_found" };
  if (promo.startsAt && promo.startsAt > now) return { ok: false, reason: "not_started" };
  if (promo.endsAt && promo.endsAt <= now) return { ok: false, reason: "expired" };
  const cartSubtotal = subtotal(lines);
  if (cartSubtotal < promo.minSubtotalCents) return { ok: false, reason: "min_subtotal" };
  if (promo.maxRedemptions !== null && promo.redemptions > promo.maxRedemptions) {
    return { ok: false, reason: "used_up" };
  }
  return { ok: true, promo, discountCents: discountFor(promo, cartSubtotal) };
}

/** A discount never exceeds the subtotal, so a total can't go below the tax on zero. */
export function discountFor(promo: Pick<PromoCode, "kind" | "amount">, subtotalCents: number): number {
  const raw = promo.kind === "percent" ? percentOf(subtotalCents, promo.amount) : promo.amount;
  return Math.min(raw, subtotalCents);
}

export async function validatePromo(code: string, lines: CartLine[]): Promise<PromoResult> {
  return checkPromo(await findPromo(code), lines);
}
