import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/cart/CheckoutButton";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { PromoCodeField } from "@/components/checkout/PromoCodeField";
import { loadCart, totals } from "@/lib/cart";
import { validatePromo } from "@/lib/promo";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const jar = await cookies();
  const cartId = jar.get("cart")?.value;
  const cart = cartId ? await loadCart(cartId) : null;
  if (!cart) notFound();

  // A code that stopped working since it was applied (expired, used up) is dropped silently.
  const code = jar.get("promo")?.value;
  const promo = code ? await validatePromo(code, cart.lines) : null;
  const applied = promo?.ok ? promo.promo.code : null;

  return (
    <main className="cart">
      <h1>Your cart</h1>
      <ul className="cart-lines">
        {cart.lines.map((line) => (
          <li key={line.productId}>
            <span>{line.name}</span>
            <span>× {line.quantity}</span>
          </li>
        ))}
      </ul>
      <PromoCodeField cartId={cart.id} applied={applied} />
      <OrderSummary totals={totals(cart.lines, promo?.ok ? promo.discountCents : 0)} currency={cart.currency} promoCode={applied} />
      <CheckoutButton cartId={cart.id} promoCode={applied ?? undefined} />
    </main>
  );
}
