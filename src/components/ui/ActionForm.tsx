"use client";

import { useActionState, useEffect, useRef } from "react";

export type FormState = { ok?: boolean; error?: string; message?: string; data?: Record<string, string> } | undefined;

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="border border-dashed border-danger/40 bg-danger/[0.04] px-3 py-2 text-[13px] text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="border border-dashed border-olive/40 bg-olive/[0.05] px-3 py-2 text-[13px] text-olive">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Form bound to a server action with inline success/error feedback. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showMessage = true,
  after,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showMessage?: boolean;
  after?: (state: FormState) => React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {showMessage ? <FormMessage state={state} /> : null}
      {after ? after(state) : null}
    </form>
  );
}
