"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ChatgptPlanBadge } from "@/components/app/ChatgptPlanBadge";
import { FormMessage, type FormState } from "@/components/ui/ActionForm";
import { ChatgptLogo } from "@/components/ui/ChatgptLogo";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MANAGE_USAGE_URL } from "@/lib/ai/chatgpt-links";

type ModelOption = { id: string; label?: string };
type Connection = {
  /** Has tokens. False after signing out, when only the registration is kept. */
  signedIn: boolean;
  email: string | null;
  planUsage: boolean;
  model: string | null;
  enabled: boolean;
};
type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function ChatgptPlanPanel({
  connection,
  redirectUri,
  start,
  finish,
  signOut,
  savePrefs,
  listModels,
}: {
  connection: Connection | null;
  redirectUri: string;
  start: (newAccount: boolean) => Promise<{ url?: string; error?: string }>;
  finish: Action;
  signOut: () => Promise<FormState>;
  savePrefs: Action;
  listModels: () => Promise<{ models: ModelOption[] } | { error: string }>;
}) {
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [welcome, setWelcome] = useState(false);
  const [finishState, finishAction] = useActionState(async (prev: FormState, form: FormData) => {
    const res = await finish(prev, form);
    if (res?.ok) {
      setSignInUrl(null);
      if (res.data?.welcome) setWelcome(true);
    }
    return res;
  }, undefined);

  function begin(newAccount: boolean) {
    // Opened before the request so popup blockers treat it as part of the click.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      setStartError(null);
      const res = await start(newAccount);
      if (res.error || !res.url) {
        tab?.close();
        setStartError(res.error ?? "Could not start signing in");
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = res.url;
      }
      setSignInUrl(res.url);
    });
  }

  const continueButton = (newAccount = false) => (
    <button type="button" className="btn btn-primary btn-md self-start" disabled={starting} onClick={() => begin(newAccount)}>
      <ChatgptLogo size={16} />
      {starting ? "Opening…" : "Continue with ChatGPT"}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      {signInUrl ? (
        <form action={finishAction} className="flex max-w-[620px] flex-col gap-3">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-[20px] text-body">
            <li>
              In the{" "}
              <a href={signInUrl} target="_blank" rel="noreferrer" className="link">
                ChatGPT tab
              </a>
              , sign in and allow Omakaze to use your ChatGPT plan.
            </li>
            <li>
              ChatGPT then sends you to an address starting with <code className="font-mono">{redirectUri.replace(/\/auth\/callback$/, "")}</code>.
              The page will not load. That is expected.
            </li>
            <li>Copy the whole address from the address bar and paste it here.</li>
          </ol>
          <label className="field-label" htmlFor="chatgpt-callback">
            Address after signing in
          </label>
          <input
            id="chatgpt-callback"
            name="callback"
            className="input font-mono"
            autoComplete="off"
            spellCheck={false}
            placeholder={`${redirectUri}?code=…`}
            required
          />
          <FormMessage state={finishState} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Connecting…">Finish</SubmitButton>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setSignInUrl(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : connection?.signedIn ? (
        <Connected connection={connection} signOut={signOut} savePrefs={savePrefs} listModels={listModels} reconsent={continueButton} />
      ) : (
        <div className="flex flex-col gap-3">
          {continueButton()}
          {connection ? (
            <button type="button" className="link self-start text-[13px]" disabled={starting} onClick={() => begin(true)}>
              Use a different ChatGPT account
            </button>
          ) : null}
          {finishState?.ok ? <FormMessage state={finishState} /> : null}
        </div>
      )}
      {startError ? <FormMessage state={{ error: startError }} /> : null}
      {welcome ? <WelcomeDialog onClose={() => setWelcome(false)} /> : null}
    </div>
  );
}

function Connected({
  connection,
  signOut,
  savePrefs,
  listModels,
  reconsent,
}: {
  connection: Connection;
  signOut: () => Promise<FormState>;
  savePrefs: Action;
  listModels: () => Promise<{ models: ModelOption[] } | { error: string }>;
  reconsent: () => React.ReactNode;
}) {
  const [state, formAction] = useActionState(savePrefs, undefined);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setModelError(null);
    const res = await listModels();
    setLoading(false);
    if ("error" in res) setModelError(res.error);
    else setModels(res.models);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-8 items-center justify-center bg-black text-white">
          <ChatgptLogo size={18} />
        </span>
        <div className="flex-1">
          <p className="text-[14px] text-ink">{connection.email ?? "ChatGPT account"}</p>
          {connection.planUsage ? (
            <ChatgptPlanBadge />
          ) : (
            <p className="text-[12px] text-muted">Signed in. Plan usage not allowed.</p>
          )}
        </div>
        <ConfirmButton action={signOut} confirm="Sign out of ChatGPT? Guides you generate will use the workspace provider.">
          Sign out
        </ConfirmButton>
      </div>

      {connection.planUsage ? (
        <form action={formAction} className="flex max-w-[620px] flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="chatgpt-model">
              Model
            </label>
            <div className="flex gap-2">
              <input
                id="chatgpt-model"
                name="model"
                className="input font-mono"
                list="chatgpt-models"
                autoComplete="off"
                defaultValue={connection.model ?? ""}
                onFocus={() => {
                  if (!models && !loading && !modelError) void load();
                }}
                placeholder="Load the models your plan includes"
                required
              />
              <button type="button" className="btn btn-secondary btn-md shrink-0" disabled={loading} onClick={() => void load()}>
                {loading ? "Loading…" : "Load models"}
              </button>
            </div>
            <datalist id="chatgpt-models">
              {models?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
            {modelError ? <p className="mt-1.5 text-[12px] text-danger">{modelError}</p> : null}
          </div>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" name="enabled" defaultChecked={connection.enabled} />
            Use my ChatGPT plan for guides I generate
          </label>
          <FormMessage state={state} />
          <div>
            <SubmitButton pendingText="Saving…">Save</SubmitButton>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-body">
            ChatGPT plan usage was not allowed when you signed in. Sign in again and allow it to generate guides with your plan,
            or keep using the workspace provider.
          </p>
          {reconsent()}
        </div>
      )}
    </div>
  );
}

function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="chatgpt-welcome-title"
      className="m-auto max-w-[440px] border border-black/15 bg-white p-6 text-ink backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3">
        <ChatgptLogo size={24} />
        <h2 id="chatgpt-welcome-title" className="font-serif text-[22px] leading-tight tracking-[-0.02em]">
          You&apos;re using your ChatGPT plan
        </h2>
        <p className="text-[14px] leading-[22px] text-body">
          Guides you generate in Omakaze now use your ChatGPT plan and count toward its usage limits. You can see and
          manage that usage in{" "}
          <a href={MANAGE_USAGE_URL} target="_blank" rel="noreferrer" className="link">
            ChatGPT settings
          </a>
          .
        </p>
        <form method="dialog" className="mt-2">
          <button type="submit" className="btn btn-primary btn-md" autoFocus>
            Got it
          </button>
        </form>
      </div>
    </dialog>
  );
}
