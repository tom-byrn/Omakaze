"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/app/new/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function NewWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="ws-name">
          Name
        </label>
        <input id="ws-name" name="name" required placeholder="Acme Engineering" className="input" />
      </div>
      {state?.error ? <p className="text-[13px] text-danger">{state.error}</p> : null}
      <div>
        <SubmitButton pendingText="Creating…">Create workspace</SubmitButton>
      </div>
    </form>
  );
}
