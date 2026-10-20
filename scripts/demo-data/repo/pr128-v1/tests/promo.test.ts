import { describe, expect, it } from "vitest";
import { checkPromo, discountFor, type PromoCode } from "@/lib/promo";

const lines = [
  { productId: "p1", name: "Linen apron", quantity: 2, unitCents: 3400 },
  { productId: "p2", name: "Cast iron skillet", quantity: 1, unitCents: 5900 },
];

const now = new Date("2026-04-10T12:00:00Z");

function promo(overrides: Partial<PromoCode> = {}): PromoCode {
  return {
    id: "promo_1",
    code: "SPRING15",
    kind: "percent",
    amount: 15,
    minSubtotalCents: 0,
    maxRedemptions: null,
    redemptions: 0,
    startsAt: null,
    endsAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

describe("checkPromo", () => {
  it("applies a percentage to the subtotal", () => {
    expect(checkPromo(promo(), lines, now)).toMatchObject({ ok: true, discountCents: 1905 });
  });

  it("rejects unknown codes", () => {
    expect(checkPromo(null, lines, now)).toEqual({ ok: false, reason: "not_found" });
  });

  it("respects the start and end dates", () => {
    const later = promo({ startsAt: new Date("2026-05-01T00:00:00Z") });
    expect(checkPromo(later, lines, now)).toEqual({ ok: false, reason: "not_started" });
    expect(checkPromo(promo({ endsAt: now }), lines, now)).toEqual({ ok: false, reason: "expired" });
  });

  it("requires the minimum subtotal", () => {
    expect(checkPromo(promo({ minSubtotalCents: 20000 }), lines, now)).toEqual({ ok: false, reason: "min_subtotal" });
  });
});

describe("discountFor", () => {
  it("caps fixed discounts at the subtotal", () => {
    expect(discountFor({ kind: "fixed", amount: 50000 }, 12700)).toBe(12700);
  });

  it("rounds percentages to whole cents", () => {
    expect(discountFor({ kind: "percent", amount: 15 }, 999)).toBe(150);
  });
});
