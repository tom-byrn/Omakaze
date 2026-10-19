"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NETWORK_ERROR = "Could not reach the store. Check your connection and try again.";

export function CheckoutButton({ cartId }: { cartId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function checkout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      router.push("/orders/" + data.orderId);
    } catch {
      // fetch rejects when the request never reached the server; the cart is unchanged.
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="checkout">
      <button type="button" className="button-primary" onClick={checkout} disabled={pending}>
        {pending ? "Placing order…" : "Place order"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
