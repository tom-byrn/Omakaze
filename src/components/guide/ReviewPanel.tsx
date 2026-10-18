"use client";

import { RiCheckboxCircleFill, RiCheckboxBlankCircleLine } from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import type { ViewerSection } from "./GuideViewer";

type Event = "APPROVE" | "REQUEST_CHANGES" | "COMMENT" | "ISSUE_COMMENT";

export function ReviewPanel({
  guideId,
  sections,
  reviewed,
  me,
  prUrl,
  onGoto,
  onDone,
}: {
  guideId: string;
  sections: ViewerSection[];
  reviewed: Set<string>;
  me: { id: string; name: string; hasGitHub: boolean };
  prUrl: string;
  onGoto: (step: number) => void;
  onDone: (text: string, href?: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const done = sections.filter((s) => reviewed.has(s.id)).length;

  async function submit(event: Event) {
    setPending(event);
    setError(null);
    const res = await fetch(`/api/guides/${guideId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, body }),
    });
    const data = (await res.json()) as { error?: string; htmlUrl?: string };
    setPending(null);
    if (!res.ok) {
      setError(data.error ?? "Could not submit the review");
      return;
    }
    const label =
      event === "APPROVE" ? "Approved on GitHub" : event === "REQUEST_CHANGES" ? "Changes requested on GitHub" : "Comment posted to GitHub";
    setSubmitted(data.htmlUrl ?? prUrl);
    setBody("");
    onDone(label, data.htmlUrl);
  }

  return (
    <div className="animate-reveal">
      <span className="eyebrow">Finish</span>
      <h2 className="mt-6 font-serif text-[32px] leading-[1.04] tracking-[-0.03em] text-black lg:text-[38px]">Submit your review.</h2>
      <p className="lead mt-3">
        You reviewed {done} of {sections.length} sections. The review is posted to the pull request on GitHub.
      </p>
      <ul className="mt-6 border-t border-dashed border-line">
        {sections.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onGoto(i + 1)}
              className="flex w-full items-center gap-3 border-b border-dashed border-line py-2.5 text-left hover:bg-black/[0.02]"
            >
              {reviewed.has(s.id) ? (
                <RiCheckboxCircleFill size={16} className="text-ink" />
              ) : (
                <RiCheckboxBlankCircleLine size={16} className="text-black/30" />
              )}
              <span className="font-mono text-[11px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1 text-[14px] text-ink">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <label className="field-label" htmlFor="review-body">
          Review comment
        </label>
        <textarea
          id="review-body"
          className="input min-h-[130px]"
          placeholder="Summary of your review (markdown)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {!me.hasGitHub ? (
        <p className="mt-3 text-[12px] leading-[18px] text-body">
          Your account has no linked GitHub account, so comments are posted through the workspace connection with your name attached.
          Approving or requesting changes needs a{" "}
          <Link href="/account" className="link">
            linked GitHub account
          </Link>
          .
        </p>
      ) : null}
      {error ? <p className="mt-3 border border-dashed border-danger/40 px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      {submitted ? (
        <p className="mt-3 border border-dashed border-olive/40 px-3 py-2 text-[13px] text-olive">
          Submitted.{" "}
          <a href={submitted} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            View on GitHub
          </a>
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-md" disabled={pending !== null || !me.hasGitHub} onClick={() => submit("APPROVE")}>
          {pending === "APPROVE" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-md"
          disabled={pending !== null || !me.hasGitHub || !body.trim()}
          onClick={() => submit("REQUEST_CHANGES")}
        >
          {pending === "REQUEST_CHANGES" ? "Submitting…" : "Request changes"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-md"
          disabled={pending !== null || !body.trim()}
          onClick={() => submit(me.hasGitHub ? "COMMENT" : "ISSUE_COMMENT")}
        >
          {pending === "COMMENT" || pending === "ISSUE_COMMENT" ? "Posting…" : "Comment"}
        </button>
      </div>
    </div>
  );
}
