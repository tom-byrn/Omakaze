"use client";

import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function CreateTokenForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      className="flex flex-col gap-3"
      after={(state) =>
        state?.data?.token ? (
          <div className="flex flex-wrap items-center gap-2 border border-dashed border-ink/40 bg-paper p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{state.data.token}</code>
            <CopyButton text={state.data.token} label="Copy token" className="btn btn-primary btn-xs" />
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
        <div>
          <label className="label" htmlFor="token-name">
            Name
          </label>
          <input id="token-name" name="name" placeholder="e.g. Claude Code on my laptop" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="token-expires">
            Expires
          </label>
          <select id="token-expires" name="expires" className="input" defaultValue="90">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="0">Never</option>
          </select>
        </div>
        <SubmitButton pendingText="Creating…">Create token</SubmitButton>
      </div>
    </ActionForm>
  );
}
