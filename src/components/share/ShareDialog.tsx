"use client";

import { RiCloseLine, RiShareLine } from "@remixicon/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SHARE_EXPIRY_LABELS, SHARE_EXPIRY_VALUES } from "@/lib/share/options";
import { ShareLinkList, type ShareLinkRow } from "./ShareLinkList";

/** "Share" on the guide page: create a read-only link and see the pull request's active links. */
export function ShareDialog({
  slug,
  version,
  versionReady,
  prNumber,
  createAction,
  cannotCreate,
  links,
}: {
  slug: string;
  version: number;
  /** Only published versions can be shared on their own. */
  versionReady: boolean;
  prNumber: number;
  createAction: (prev: FormState, form: FormData) => Promise<FormState>;
  /** Why the viewer can't create links (their role, or the workspace setting); null when they can. */
  cannotCreate: string | null;
  links: ShareLinkRow[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // A new form each time the dialog opens, so a link created earlier isn't shown again.
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.showModal()}>
        <RiShareLine size={14} /> Share
      </button>
      <dialog
        ref={ref}
        onClose={() => setFormKey((k) => k + 1)}
        aria-labelledby="share-dialog-title"
        className="m-auto max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-[560px] border border-black/15 bg-white p-0 text-ink backdrop:bg-[rgb(0_0_0/0.45)]"
      >
        <div className="flex items-start gap-3 border-b border-dashed border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 id="share-dialog-title" className="font-serif text-[22px] leading-tight tracking-[-0.02em]">
              Share a read-only link
            </h2>
            <p className="mt-1.5 text-[13px] leading-[20px] text-body">
              Anyone with the link can read the guide and its diffs without signing in. They can&apos;t comment or review, and
              they don&apos;t see who reviewed what.
            </p>
          </div>
          <button type="button" className="text-black/40 hover:text-ink" aria-label="Close" onClick={() => ref.current?.close()}>
            <RiCloseLine size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {cannotCreate ? (
            <p className="border border-dashed border-line bg-paper px-3 py-2 text-[13px] text-body">{cannotCreate}</p>
          ) : (
            <ActionForm
              key={formKey}
              action={createAction}
              className="flex flex-col gap-4"
              after={(state) =>
                state?.data?.url ? (
                  <div className="flex flex-wrap items-center gap-2 border border-dashed border-ink/40 bg-paper p-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" data-share-url>
                      {state.data.url}
                    </code>
                    <CopyButton text={state.data.url} label="Copy link" className="btn btn-primary btn-xs" />
                  </div>
                ) : null
              }
            >
              <fieldset>
                <legend className="field-label">Share</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <TargetOption
                    value="version"
                    defaultChecked={versionReady}
                    disabled={!versionReady}
                    title={`This version (v${version})`}
                    help={versionReady ? "Stays on this version." : "Only published versions can be shared on their own."}
                  />
                  <TargetOption
                    value="latest"
                    defaultChecked={!versionReady}
                    title="Latest version"
                    help={`Follows new versions of #${prNumber}. Readers can switch to earlier ones.`}
                  />
                </div>
              </fieldset>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
                <div>
                  <label className="field-label" htmlFor="share-expires">
                    Expires
                  </label>
                  <select id="share-expires" name="expires" className="input" defaultValue="7">
                    {SHARE_EXPIRY_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {SHARE_EXPIRY_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex h-10 cursor-pointer items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" name="comments" className="h-4 w-4 accent-ink" />
                  Include review comments from GitHub
                </label>
              </div>
              <div>
                <SubmitButton pendingText="Creating…">Create link</SubmitButton>
              </div>
            </ActionForm>
          )}
        </div>

        <div className="border-t border-dashed border-line px-6 py-5">
          <p className="mono-label mb-2">Active links to #{prNumber}</p>
          <ShareLinkList links={links} slug={slug} />
        </div>
        <div className="border-t border-dashed border-line bg-paper px-6 py-3 text-[12px] text-muted">
          Every link in this workspace is listed in{" "}
          <Link href={`/w/${slug}/settings/sharing`} className="link">
            Settings → Share links
          </Link>
          .
        </div>
      </dialog>
    </>
  );
}

function TargetOption({ value, title, help, defaultChecked, disabled }: { value: string; title: string; help: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 border border-black/15 bg-white px-4 py-3 transition-colors hover:border-black/40 has-[:checked]:border-ink has-[:checked]:bg-paper has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
      <span className="flex items-center gap-2">
        <input type="radio" name="target" value={value} defaultChecked={defaultChecked} disabled={disabled} className="accent-ink" />
        <span className="text-[14px] font-medium text-ink">{title}</span>
      </span>
      <span className="text-[12px] leading-[18px] text-muted">{help}</span>
    </label>
  );
}
