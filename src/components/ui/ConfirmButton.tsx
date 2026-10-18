"use client";

import { useState, useTransition } from "react";
import type { FormState } from "./ActionForm";

/** Button that runs a server action, optionally after a confirm() prompt. */
export function ConfirmButton({
  action,
  confirm,
  children,
  className = "btn btn-ghost btn-xs",
  pendingText,
}: {
  action: () => Promise<FormState | void>;
  confirm?: string;
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const res = await action();
            setError(res && "error" in res && res.error ? res.error : null);
          });
        }}
      >
        {pending ? (pendingText ?? children) : children}
      </button>
      {error ? <span className="mt-1 max-w-[260px] text-right text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
