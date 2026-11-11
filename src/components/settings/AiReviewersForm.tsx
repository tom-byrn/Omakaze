"use client";

import { RiAddLine, RiCloseLine } from "@remixicon/react";
import { useState } from "react";
import { ActionForm, type FormState } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AI_REVIEWER_PRESETS, MAX_CUSTOM_REVIEWERS, MAX_WAIT_MINUTES, type AiReviewerConfig } from "@/lib/ai-reviewers/config";

type Row = { name: string; logins: string; checks: string };

/** Settings → Automation: which AI code reviewers automatic guides wait for, and for how long. */
export function AiReviewersForm({
  action,
  reviewers,
  wait,
  minutes,
  admin,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  /** Presets and the workspace's own reviewers (resolveAiReviewers). */
  reviewers: AiReviewerConfig[];
  wait: boolean;
  minutes: number;
  admin: boolean;
}) {
  const presets = reviewers.filter((r) => AI_REVIEWER_PRESETS.some((p) => p.key === r.key));
  const [rows, setRows] = useState<Row[]>(() =>
    reviewers.filter((r) => !AI_REVIEWER_PRESETS.some((p) => p.key === r.key)).map((r) => ({ name: r.name, logins: r.logins.join(", "), checks: r.checks.join(", ") })),
  );
  const update = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={action} className="flex flex-col">
      <fieldset disabled={!admin} className="flex flex-col">
        <label className="flex cursor-pointer items-start gap-3 py-1">
          <input type="checkbox" name="waitForAiReviewers" defaultChecked={wait} className="mt-1 h-4 w-4 accent-ink" />
          <span>
            <span className="block text-[14px] text-ink">Wait for AI code reviewers before writing automatic guides</span>
            <span className="block text-[13px] leading-[20px] text-body">
              The guide starts right away and shows which reviewers are still working. It is written once they are done, or when the wait
              runs out, with a one-line verdict on each finding in the section that covers it.
            </span>
          </span>
        </label>
        <div className="mt-4 flex items-center gap-3 pl-7">
          <label htmlFor="aiReviewerWaitMinutes" className="text-[13px] text-body">
            Wait at most
          </label>
          <input
            id="aiReviewerWaitMinutes"
            name="aiReviewerWaitMinutes"
            type="number"
            min={1}
            max={MAX_WAIT_MINUTES}
            defaultValue={minutes}
            className="input w-20 font-mono"
          />
          <span className="text-[13px] text-body">minutes</span>
        </div>

        <p className="mono-label mt-6">Reviewers</p>
        <ul className="mt-2">
          {presets.map((r) => (
            <li key={r.key} className="border-t border-dashed border-line py-3 first:border-t-0">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" name={`preset:${r.key}`} defaultChecked={r.enabled} className="mt-1 h-4 w-4 accent-ink" />
                <span className="min-w-0">
                  <span className="block text-[14px] text-ink">{r.name}</span>
                  <span className="block font-mono text-[11px] leading-[18px] text-muted">
                    {r.logins.join(", ")}
                    {r.checks.length > 0 ? ` · check ${r.checks.map((c) => `“${c}”`).join(" or ")}` : " · review request"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mono-label mt-6">Your own reviewers</p>
        <p className="mt-1 text-[13px] leading-[20px] text-body">
          Any bot that comments on pull requests. Give the logins it posts as and, if it reports progress, the name of its check run or commit
          status (for a GitHub Actions workflow, the job name). A Claude Code workflow that posts with <code className="font-mono text-[12px]">GITHUB_TOKEN</code>{" "}
          comments as <code className="font-mono text-[12px]">github-actions[bot]</code>.
        </p>
        {rows.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-1 gap-2 border border-dashed border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input aria-label="Name" className="input" placeholder="Name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                <input
                  aria-label="GitHub logins"
                  className="input font-mono"
                  placeholder="bot-login[bot]"
                  value={r.logins}
                  onChange={(e) => update(i, { logins: e.target.value })}
                />
                <input
                  aria-label="Check names"
                  className="input font-mono"
                  placeholder="Check name"
                  value={r.checks}
                  onChange={(e) => update(i, { checks: e.target.value })}
                />
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${r.name || "reviewer"}`} onClick={() => setRows((l) => l.filter((_, j) => j !== i))}>
                  <RiCloseLine size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {rows.length < MAX_CUSTOM_REVIEWERS ? (
          <div className="mt-3">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((l) => [...l, { name: "", logins: "", checks: "" }])}>
              <RiAddLine size={14} /> Add a reviewer
            </button>
          </div>
        ) : null}
        <input type="hidden" name="customReviewers" value={JSON.stringify(rows)} />
      </fieldset>
      {admin ? (
        <div className="mt-6 mb-1">
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
