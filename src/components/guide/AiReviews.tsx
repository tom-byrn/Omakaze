"use client";

import { RiExternalLinkLine, RiRobot2Line, RiSearchEyeLine } from "@remixicon/react";
import clsx from "clsx";
import { useState } from "react";
import type { GuideAiReviews, ReviewerStatus } from "@/lib/ai-reviewers/signals";
import type { ReviewComment } from "./types";

/**
 * AI code reviewers in the viewer (src/lib/ai-reviewers): their state while an automatic guide
 * waits for them, the findings on the overview and in each section, and a tag on their comments.
 */

export function AiReviewerTag({ name }: { name: string }) {
  return (
    <span className="tag border-blue-bright/40 text-blue-bright" title={`AI code reviewer: ${name}`}>
      <RiRobot2Line size={11} /> AI · {name}
    </span>
  );
}

const STATE_LABEL: Record<ReviewerStatus["state"], string> = {
  running: "reviewing",
  done: "done",
  expected: "requested",
  absent: "not seen",
};

function StateChip({ status }: { status: ReviewerStatus }) {
  const label = status.state === "done" && status.findings > 0 ? `done · ${status.findings} finding${status.findings === 1 ? "" : "s"}` : STATE_LABEL[status.state];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] uppercase",
        status.state === "done" ? "text-olive" : status.state === "absent" ? "text-black/35" : "text-blue-bright",
      )}
    >
      <span
        className={clsx(
          "dot",
          status.state === "done" ? "bg-olive" : status.state === "absent" ? "bg-black/20" : "animate-pulse-dot bg-blue-bright",
        )}
      />
      {label}
    </span>
  );
}

/** Reviewers and their state, shown while an automatic guide waits for them. */
export function AiReviewerStatusList({ reviews, onSkip }: { reviews: GuideAiReviews; onSkip?: () => Promise<void> }) {
  const [skipping, setSkipping] = useState(false);
  const seen = reviews.reviewers.filter((r) => r.state !== "absent");
  const unseen = reviews.reviewers.filter((r) => r.state === "absent");
  return (
    <div data-testid="ai-review-wait">
      <ul className="px-4 py-2">
        {seen.map((r) => (
          <li key={r.key} className="flex items-center gap-3 border-t border-dashed border-line py-2 first:border-t-0">
            <RiRobot2Line size={15} className="text-black/45" />
            <span className="flex-1 text-[13px] text-ink">
              {r.name}
              {r.detail ? <span className="ml-2 font-mono text-[10px] text-black/40">{r.detail}</span> : null}
            </span>
            <StateChip status={r} />
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="text-black/35 hover:text-ink" aria-label={`Open ${r.name} on GitHub`}>
                <RiExternalLinkLine size={13} />
              </a>
            ) : null}
          </li>
        ))}
        {seen.length === 0 ? <li className="py-2 text-[13px] text-body">Looking for AI reviewers on the pull request…</li> : null}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line px-4 py-2.5 text-[12px] text-body">
        <span className="flex-1">
          {unseen.length > 0 ? `Also watching for ${unseen.map((r) => r.name).join(", ")}. ` : ""}
          Writes the guide when they are done, or after {reviews.waitMinutes} min.
        </span>
        {onSkip ? (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={skipping}
            onClick={async () => {
              setSkipping(true);
              await onSkip();
            }}
          >
            {skipping ? "Starting…" : "Skip waiting"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type AiFindingView = ReviewComment & { aiReviewer: string; sectionIndex: number | null };

/** Root comments of AI reviewers on current lines, with the 1-based number of the section that shows them. */
export function aiFindings(comments: ReviewComment[], sections: { id: string }[]): AiFindingView[] {
  return comments
    .filter((c): c is ReviewComment & { aiReviewer: string } => Boolean(c.aiReviewer) && !c.inReplyTo && !c.outdated)
    .map((c) => {
      const i = c.sectionId ? sections.findIndex((s) => s.id === c.sectionId) : -1;
      return { ...c, sectionIndex: i >= 0 ? i + 1 : null };
    });
}

/** First line of a comment as plain text, for lists. */
function excerpt(body: string, max = 100): string {
  const line =
    body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim())
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

function FindingRow({ f, onShow, showSection }: { f: AiFindingView; onShow: (f: AiFindingView) => void; showSection: boolean }) {
  return (
    <li className="border-t border-dashed border-line first:border-t-0">
      <button type="button" onClick={() => onShow(f)} className="group flex w-full items-baseline gap-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[19px] text-ink group-hover:underline group-hover:underline-offset-4">{excerpt(f.body)}</span>
          <span className="mt-0.5 block font-mono text-[10px] tracking-[0.04em] text-black/45">
            {f.aiReviewer} · {f.path}:{f.line}
            {showSection ? (f.sectionIndex ? ` · section ${String(f.sectionIndex).padStart(2, "0")}` : " · not in a section") : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Overview: which AI reviewers looked at the change, and every finding with the section it is in. */
export function AiReviewsCard({
  reviews,
  findings,
  onShow,
}: {
  reviews: GuideAiReviews | null;
  findings: AiFindingView[];
  onShow: (f: AiFindingView) => void;
}) {
  const reviewers = (reviews?.reviewers ?? []).filter((r) => r.state !== "absent");
  if (reviewers.length === 0 && findings.length === 0) return null;
  const names = [...new Set([...reviewers.map((r) => r.name), ...findings.map((f) => f.aiReviewer)])];
  const note =
    reviews?.outcome === "timed_out"
      ? `Written after waiting ${reviews.waitMinutes} min; some reviewers had not finished.`
      : reviews?.outcome === "skipped"
        ? "Written without waiting for every reviewer."
        : reviews?.waited
          ? "Written after the AI reviews came in."
          : null;
  return (
    <div className="mt-10 border border-black/15 bg-white" data-testid="ai-reviews-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-line px-4 py-3">
        <RiSearchEyeLine size={15} className="text-blue-bright" />
        <p className="mono-label flex-1">AI code reviews</p>
        <span className="font-mono text-[10px] tracking-[0.06em] text-black/45 uppercase">
          {findings.length} finding{findings.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="px-4 py-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {names.map((name) => {
            const r = reviewers.find((x) => x.name === name);
            const n = findings.filter((f) => f.aiReviewer === name).length;
            return (
              <li key={name} className="flex items-center gap-2 text-[13px] text-ink">
                <RiRobot2Line size={14} className="text-black/45" />
                {r?.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {name}
                  </a>
                ) : (
                  name
                )}
                <span className="font-mono text-[10px] text-black/45">
                  {n} finding{n === 1 ? "" : "s"}
                  {r && r.state !== "done" ? ` · ${STATE_LABEL[r.state]}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {note ? <p className="mt-2 text-[12px] text-body">{note}</p> : null}
        {findings.length > 0 ? (
          <ol className="mt-3 border-t border-dashed border-line">
            {findings.map((f) => (
              <FindingRow key={f.id} f={f} onShow={onShow} showSection />
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/** Above a section's explanation: the AI findings on its lines. */
export function SectionFindings({ findings, onShow }: { findings: AiFindingView[]; onShow: (f: AiFindingView) => void }) {
  if (findings.length === 0) return null;
  return (
    <div className="mt-6 border border-blue-bright/30 bg-blue-bright/[0.04] px-4 py-3" data-testid="section-ai-findings">
      <p className="mono-label flex items-center gap-2 text-blue-bright">
        <RiRobot2Line size={13} /> {findings.length} AI review finding{findings.length === 1 ? "" : "s"} in this section
      </p>
      <ol className="mt-1">
        {findings.map((f) => (
          <FindingRow key={f.id} f={f} onShow={onShow} showSection={false} />
        ))}
      </ol>
    </div>
  );
}
