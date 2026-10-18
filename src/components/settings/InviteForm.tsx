"use client";

import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function InviteForm({
  action,
  canEmail,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  canEmail: boolean;
}) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      className="flex flex-col gap-4"
      after={(state) =>
        state?.data?.url ? (
          <div className="flex flex-wrap items-center gap-2 border border-dashed border-line bg-paper p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{state.data.url}</code>
            <CopyButton text={state.data.url} label="Copy link" className="btn btn-primary btn-xs" />
          </div>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
        <div>
          <label className="label" htmlFor="invite-email">
            Email {canEmail ? "" : "(optional, restricts the link)"}
          </label>
          <input id="invite-email" name="email" type="email" placeholder="teammate@example.com" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" name="role" className="input" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <SubmitButton pendingText="Creating…">{canEmail ? "Send invite" : "Create invite link"}</SubmitButton>
      </div>
      {!canEmail ? (
        <p className="text-[12px] text-muted">Email is not configured on this instance (SMTP_URL), so invites are shared as links.</p>
      ) : null}
    </ActionForm>
  );
}
