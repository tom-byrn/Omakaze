import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CheckoutButton } from "@/components/cart/CheckoutButton";
import { Summary } from "@/components/cart/Summary";
import { loadCart, totals } from "@/lib/cart";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const cartId = (await cookies()).get("cart")?.value;
  const cart = cartId ? await loadCart(cartId) : null;
  if (!cart) notFound();

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
      <Summary totals={totals(cart.lines)} currency={cart.currency} />
      <CheckoutButton cartId={cart.id} />
    </main>
  );
}
