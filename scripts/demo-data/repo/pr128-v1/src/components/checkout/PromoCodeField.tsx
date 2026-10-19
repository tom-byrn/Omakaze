"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PromoCodeField({ cartId, applied }: { cartId: string; applied: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(applied ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/promo/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, code }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    document.cookie = "promo=" + encodeURIComponent(data.code) + "; path=/; max-age=86400; samesite=lax";
    router.refresh();
  }

  function remove() {
    document.cookie = "promo=; path=/; max-age=0";
    setCode("");
    router.refresh();
  }

  if (applied) {
    return (
      <p className="promo-applied">
        Code <strong>{applied}</strong> applied.{" "}
        <button type="button" className="link" onClick={remove}>
          Remove
        </button>
      </p>
    );
  }

  return (
    <form className="promo" onSubmit={apply}>
      <label htmlFor="promo-code">Promo code</label>
      <div className="promo-row">
        <input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={pending || !code.trim()}>
          {pending ? "Checking…" : "Apply"}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
