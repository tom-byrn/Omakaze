import { describe, expect, it } from "vitest";
import { lineTax, subtotal, totals } from "@/lib/cart";

const lines = [
  { productId: "p1", name: "Linen apron", quantity: 2, unitCents: 3400 },
  { productId: "p2", name: "Cast iron skillet", quantity: 1, unitCents: 5900 },
];

describe("cart totals", () => {
  it("adds up line items", () => {
    expect(subtotal(lines)).toBe(12700);
  });

  it("adds sales tax", () => {
    expect(totals(lines)).toEqual({ subtotalCents: 12700, taxCents: 1048, totalCents: 13748 });
  });

  it("rounds tax per line, as printed on the invoice", () => {
    const towels = ["p3", "p4", "p5"].map((productId) => ({ productId, name: "Tea towel", quantity: 1, unitCents: 199 }));
    expect(towels.map(lineTax)).toEqual([16, 16, 16]);
    expect(totals(towels).taxCents).toBe(48);
  });
});
