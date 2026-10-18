"use client";

import { useActionState, useState } from "react";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Provider = {
  id: string;
  label: string;
  description: string;
  defaultModel: string;
  baseUrl: string;
  keyRequired: boolean;
  local: boolean;
  publicModels: boolean;
};
type ModelOption = { id: string; label?: string };
type Current = { provider: string | null; model: string | null; baseUrl: string | null; hasKey: boolean };
type ListModels = (input: { provider: string; baseUrl: string; apiKey: string }) => Promise<{ models: ModelOption[] } | { error: string }>;

export function AiSettingsForm({
  action,
  listModels,
  providers,
  current,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  listModels: ListModels;
  providers: Provider[];
  current: Current;
}) {
  const [state, formAction] = useActionState(action, undefined);
  // Nothing is preselected: built-in generation is optional.
  const [provider, setProvider] = useState<string | null>(current.provider);
  const info = providers.find((p) => p.id === provider) ?? null;
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset>
        <legend className="field-label">Provider</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer flex-col gap-1 border border-black/15 bg-white px-4 py-3 transition-colors hover:border-black/40 has-[:checked]:border-ink has-[:checked]:bg-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => setProvider(p.id)}
                  className="sr-only"
                />
                <span className="text-[14px] font-medium text-ink">{p.label}</span>
                {p.local ? <span className="tag">Local</span> : null}
              </span>
              <span className="text-[12px] leading-[18px] text-muted">{p.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {info ? (
        <ProviderFields key={info.id} info={info} current={current} listModels={listModels} />
      ) : (
        <p className="text-[13px] text-muted">
          Pick a provider to set it up, or leave this empty: guides can still come from agents over MCP, the REST API or the
          editor.
        </p>
      )}

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {info ? (
          <>
            <SubmitButton name="intent" value="save" pendingText="Saving…">
              Save
            </SubmitButton>
            <SubmitButton name="intent" value="test" className="btn btn-secondary btn-md" pendingText="Testing…">
              Test connection
            </SubmitButton>
          </>
        ) : null}
        {current.provider ? (
          <SubmitButton name="intent" value="clear" className="btn btn-ghost btn-md" pendingText="Removing…">
            Remove provider
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}

function ProviderFields({ info, current, listModels }: { info: Provider; current: Current; listModels: ListModels }) {
  const sameProvider = info.id === current.provider;
  const [model, setModel] = useState(sameProvider ? (current.model ?? "") : "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(sameProvider ? (current.baseUrl ?? "") : "");
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const hasKey = Boolean(apiKey.trim()) || (sameProvider && current.hasKey);
  const canLoad = info.publicModels || hasKey;
  // Self-hosted servers need their address up front; for hosted APIs it is an advanced override.
  const showBaseUrl = info.local || info.id === "openai-compatible";

  async function load() {
    setLoading(true);
    setModelError(null);
    const res = await listModels({ provider: info.id, baseUrl, apiKey });
    setLoading(false);
    if ("error" in res) {
      setModels(null);
      setModelError(res.error);
    } else {
      setModels(res.models);
    }
  }

  const baseUrlField = (
    <div>
      <label className="field-label" htmlFor="baseUrl">
        Base URL {info.local || info.id === "openai-compatible" ? "" : "(optional)"}
      </label>
      <input
        id="baseUrl"
        name="baseUrl"
        className="input font-mono"
        value={baseUrl}
        onChange={(e) => {
          setBaseUrl(e.target.value);
          setModels(null);
        }}
        placeholder={info.baseUrl}
      />
      {info.local ? (
        <p className="mt-1.5 text-[12px] text-muted">
          The address as seen from the Guided PRs server. In Docker, <code className="font-mono">localhost</code> is the
          container: use <code className="font-mono">host.docker.internal</code> or the service name instead.
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex max-w-[620px] flex-col gap-4">
      {showBaseUrl ? baseUrlField : null}
      <div>
        <label className="field-label" htmlFor="apiKey">
          API key {info.keyRequired ? "" : "(optional)"}
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          className="input font-mono"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setModels(null);
          }}
          placeholder={sameProvider && current.hasKey ? "Saved. Enter a new key to replace it." : info.keyRequired ? "Paste your API key" : "Only if your server requires one"}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="model">
          Model
        </label>
        <div className="flex gap-2">
          <input
            id="model"
            name="model"
            className="input font-mono"
            list="ai-models"
            autoComplete="off"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onFocus={() => {
              if (canLoad && !models && !loading && !modelError) void load();
            }}
            placeholder={info.defaultModel || "model name"}
          />
          <button type="button" className="btn btn-secondary btn-md shrink-0" disabled={!canLoad || loading} onClick={() => void load()}>
            {loading ? "Loading…" : "Load models"}
          </button>
        </div>
        <datalist id="ai-models">
          {models?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
        <p className="mt-1.5 text-[12px] text-muted">
          {modelError ? (
            <span className="text-danger">{modelError}</span>
          ) : models ? (
            models.length ? (
              `${models.length} model${models.length === 1 ? "" : "s"} available. Start typing to filter.`
            ) : (
              "The provider returned no models. Enter a model name."
            )
          ) : !canLoad ? (
            "Enter an API key to load the model list."
          ) : info.defaultModel ? (
            `Leave empty to use ${info.defaultModel}.`
          ) : (
            "Required. Load the list or enter a model name."
          )}
        </p>
      </div>
      {showBaseUrl ? null : (
        <details className="text-[13px]" open={sameProvider && Boolean(current.baseUrl)}>
          <summary className="cursor-pointer text-muted">Advanced: custom base URL</summary>
          <div className="mt-3">{baseUrlField}</div>
        </details>
      )}
    </div>
  );
}
