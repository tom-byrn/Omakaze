"use client";

import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Provider = { id: string; label: string; defaultModel: string; baseUrl: string; keyRequired: boolean };

export function AiSettingsForm({
  action,
  providers,
  current,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  providers: Provider[];
  current: { provider: string | null; model: string | null; baseUrl: string | null; hasKey: boolean; instructions: string | null };
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [provider, setProvider] = useState(current.provider ?? "openrouter");
  const info = providers.find((p) => p.id === provider) ?? providers[0];
  const sameProvider = provider === current.provider;
  return (
    <form action={formAction} className="flex max-w-[620px] flex-col gap-4">
      <div>
        <label className="label" htmlFor="provider">
          Provider
        </label>
        <select id="provider" name="provider" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="model">
          Model
        </label>
        <input
          id="model"
          name="model"
          className="input font-mono"
          key={`model-${provider}`}
          defaultValue={sameProvider ? (current.model ?? "") : ""}
          placeholder={info.defaultModel || "model name"}
        />
        <p className="mt-1.5 text-[12px] text-muted">
          {info.defaultModel ? `Leave empty to use ${info.defaultModel}.` : "Required for this provider."}
        </p>
      </div>
      <div>
        <label className="label" htmlFor="apiKey">
          API key {info.keyRequired ? "" : "(optional)"}
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          className="input font-mono"
          placeholder={sameProvider && current.hasKey ? "Saved. Enter a new key to replace it." : "Paste your API key"}
        />
      </div>
      <div>
        <label className="label" htmlFor="baseUrl">
          Base URL (optional)
        </label>
        <input
          id="baseUrl"
          name="baseUrl"
          className="input font-mono"
          key={`base-${provider}`}
          defaultValue={sameProvider ? (current.baseUrl ?? "") : ""}
          placeholder={info.baseUrl}
        />
      </div>
      <div>
        <label className="label" htmlFor="instructions">
          Extra instructions (optional)
        </label>
        <textarea
          id="instructions"
          name="instructions"
          className="input"
          rows={4}
          defaultValue={current.instructions ?? ""}
          placeholder="e.g. Always include a section on database migrations. Write in British English."
        />
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="save" pendingText="Saving…">
          Save
        </SubmitButton>
        <SubmitButton name="intent" value="test" className="btn btn-secondary btn-md" pendingText="Testing…">
          Test connection
        </SubmitButton>
        {current.provider ? (
          <SubmitButton name="intent" value="clear" className="btn btn-ghost btn-md" pendingText="Removing…">
            Remove provider
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
