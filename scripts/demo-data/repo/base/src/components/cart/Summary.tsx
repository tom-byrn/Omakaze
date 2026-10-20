import { formatMoney } from "@/lib/cart";
import type { CartTotals } from "@/lib/cart";

export function Summary({ totals, currency }: { totals: CartTotals; currency: string }) {
  return (
    <dl className="summary">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatMoney(totals.subtotalCents, currency)}</dd>
      </div>
      <div>
        <dt>Tax</dt>
        <dd>{formatMoney(totals.taxCents, currency)}</dd>
      </div>
      <div className="summary-total">
        <dt>Total</dt>
        <dd>{formatMoney(totals.totalCents, currency)}</dd>
      </div>
    </dl>
  );
}
