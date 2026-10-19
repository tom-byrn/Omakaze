import { formatMoney } from "@/lib/money";
import type { CartTotals } from "@/lib/cart";

export function OrderSummary({
  totals,
  currency,
  promoCode,
}: {
  totals: CartTotals;
  currency: string;
  promoCode?: string | null;
}) {
  return (
    <dl className="summary">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatMoney(totals.subtotalCents, currency)}</dd>
      </div>
      {totals.discountCents > 0 ? (
        <div className="summary-discount">
          <dt>Discount{promoCode ? <span className="summary-code">{promoCode}</span> : null}</dt>
          <dd>−{formatMoney(totals.discountCents, currency)}</dd>
        </div>
      ) : null}
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
