"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CheckoutButton({ cartId, promoCode }: { cartId: string; promoCode?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function checkout() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, promoCode }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    router.push("/orders/" + data.orderId);
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
