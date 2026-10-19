"use client";

import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckDoubleLine,
  RiCheckboxCircleFill,
  RiCheckboxCircleLine,
  RiExternalLinkLine,
  RiFileList3Line,
  RiTextWrap,
} from "@remixicon/react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/ui/Avatar";
import type { SectionChange } from "@/lib/guides/carryover";
import type { SectionRef } from "@/lib/guides/refs";
import { timeAgo } from "@/lib/format";
import type { CodeTarget } from "@/components/markdown/CodeRefLink";
import { GenerationStatus } from "./GenerationStatus";
import { useStoredBoolean } from "./useStoredBoolean";
import { ReviewPanel } from "./ReviewPanel";
import { InterdiffPanel, MARK_COLOR, ProgressCard, SectionNotice, SinceLastVisitBanner, sectionProgress, stepMark, type SectionProgress, type StepMark } from "./ReviewChanges";
import { SectionDiffs } from "./SectionDiffs";
import { bodyWithoutSuggestions, hasSuggestion } from "@/lib/github/suggestions";
import { groupThreads, type FocusTarget, type ReviewComment, type ThreadState } from "./types";

export type ViewerSection = {
  id: string;
  title: string;
  refs: SectionRef[];
  generated: boolean;
  body: React.ReactNode;
  files: { path: string; additions: number; deletions: number }[];
  additions: number;
  deletions: number;
  reviewedBy: string[];
  /** Members whose mark carried over from an earlier version, with the version they reviewed. */
  carriedFrom?: Record<string, number>;
  /** For the viewer: the code changed since they reviewed the section in an earlier version. */
  reviewChange?: SectionChange | null;
  /** New or changed compared to the version that was current at the viewer's last visit. */
  visitChange?: SectionChange | null;
};

export type ViewerFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  sections: number[];
};

export type ViewerProps = {
  guide: {
    id: string;
    title: string;
    version: number;
    status: "draft" | "generating" | "ready" | "failed";
    headSha: string;
    author: string | null;
    source: string;
    createdVia: string;
    createdAt: string;
    error: string | null;
    summary: React.ReactNode;
    hasSummary: boolean;
  };
  sections: ViewerSection[];
  files: ViewerFile[];
  coverage: { total: number; covered: number };
  pull: { number: number; htmlUrl: string; headSha: string };
  repo: { fullName: string; htmlUrl: string };
  members: Record<string, { name: string; avatarUrl: string | null }>;
  me: { id: string; name: string; hasGitHub: boolean };
  initialStep: number | "review" | "files";
  agentPrompt: string;
  canGenerate: boolean;
  /** End of the viewer's previous visit (ISO); later comments by others are marked as new. */
  lastVisitAt?: string | null;
  /** Set when this version was published since the viewer's last visit. */
  sinceVisit?: { at: string; baselineVersion: number; versions: number[] } | null;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

const VIA_LABEL: Record<string, string> = {
  mcp: "MCP",
  api: "API",
  ui: "Omakaze",
  webhook: "automation",
  poll: "automation",
};

export function GuideViewer(props: ViewerProps) {
  const { guide, sections, files, me, members } = props;
  const router = useRouter();
  const reviewStep = sections.length + 1;
  const toStep = (s: ViewerProps["initialStep"]) => (s === "review" ? reviewStep : s === "files" ? -1 : Math.min(Math.max(0, s), reviewStep));
  const [step, setStep] = useState<number>(toStep(props.initialStep));
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [wrap, setWrap] = useStoredBoolean("omk:wrap", true);
  const [reviewed, setReviewed] = useState<Set<string>>(
    () => new Set(sections.filter((s) => s.reviewedBy.includes(me.id)).map((s) => s.id)),
  );
  // Marks of the viewer that carried over from an earlier version (section id → version reviewed).
  const [carried, setCarried] = useState<Map<string, number>>(
    () => new Map(sections.flatMap((s) => (s.carriedFrom?.[me.id] !== undefined ? [[s.id, s.carriedFrom[me.id]] as const] : []))),
  );
  const [toast, setToast] = useState<{ text: string; href?: string; error?: boolean } | null>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  // Keep the URL in sync without a server round trip.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (step === -1) url.searchParams.set("section", "files");
    else if (step === reviewStep) url.searchParams.set("section", "review");
    else if (step === 0) url.searchParams.delete("section");
    else url.searchParams.set("section", String(step));
    window.history.replaceState(window.history.state, "", url.toString());
    leftRef.current?.scrollTo({ top: 0 });
    rightRef.current?.scrollTo({ top: 0 });
  }, [step, reviewStep]);

  const comments = useSWR<{ comments: ReviewComment[]; threads?: ThreadState[] | null }>(`/api/guides/${guide.id}/comments`, getJson, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const since = props.lastVisitAt ? Date.parse(props.lastVisitAt) : null;
  // Comments by others since the viewer's last visit are marked as new.
  const commentList = useMemo(
    () => (comments.data?.comments ?? []).map((c) => (since !== null && !c.mine && Date.parse(c.createdAt) > since ? { ...c, isNew: true } : c)),
    [comments.data, since],
  );
  // Resolution state of the review threads; missing when GitHub's GraphQL API couldn't be read.
  const threadStates = useMemo(
    () => (comments.data?.threads ? new Map(comments.data.threads.map((t) => [t.id, t])) : undefined),
    [comments.data],
  );
  const threadsByPath = useMemo(() => groupThreads(commentList, threadStates), [commentList, threadStates]);
  const resolvedCount = comments.data?.threads?.filter((t) => t.isResolved).length ?? 0;
  const [showResolved, setShowResolved] = useStoredBoolean("omk:show-resolved", false);

  const flash = useCallback((text: string, opts: { href?: string; error?: boolean } = {}) => {
    setToast({ text, ...opts });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const onComment = useCallback(
    async (input: { path: string; line: number; side: "LEFT" | "RIGHT"; startLine?: number | null; body: string }) => {
      const sectionId = step >= 1 && step <= sections.length ? sections[step - 1].id : null;
      const res = await fetch(`/api/guides/${guide.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, sectionId }),
      });
      const data = (await res.json()) as { error?: string; htmlUrl?: string; comment?: ReviewComment; thread?: ThreadState | null };
      if (!res.ok) return data.error ?? "Could not post the comment";
      flash("Comment posted to GitHub", { href: data.htmlUrl });
      if (data.comment) {
        const added = data.comment;
        const thread = data.thread;
        await comments.mutate(
          (d) => ({
            comments: [...(d?.comments ?? []).filter((c) => c.id !== added.id), added],
            threads: d?.threads && thread ? [...d.threads.filter((t) => t.id !== thread.id), thread] : d?.threads,
          }),
          { revalidate: false },
        );
      }
      return null;
    },
    [guide.id, step, sections, comments, flash],
  );

  const onReply = useCallback(
    async (rootId: number, body: string) => {
      const res = await fetch(`/api/guides/${guide.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inReplyTo: rootId, body }),
      });
      const data = (await res.json()) as { error?: string; htmlUrl?: string; comment?: ReviewComment };
      if (!res.ok) return data.error ?? "Could not post the reply";
      flash("Reply posted to GitHub", { href: data.htmlUrl });
      if (data.comment) {
        const added = data.comment;
        await comments.mutate((d) => ({ ...d, comments: [...(d?.comments ?? []).filter((c) => c.id !== added.id), added] }), { revalidate: false });
      }
      return null;
    },
    [guide.id, comments, flash],
  );

  const onDelete = useCallback(
    async (commentId: number) => {
      const res = await fetch(`/api/guides/${guide.id}/comments?commentId=${commentId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return data.error ?? "Could not delete the comment";
      flash("Comment deleted on GitHub");
      await comments.mutate((d) => ({ ...d, comments: (d?.comments ?? []).filter((c) => c.id !== commentId) }), { revalidate: false });
      return null;
    },
    [guide.id, comments, flash],
  );

  const onResolve = useCallback(
    async (threadId: string, resolved: boolean) => {
      const res = await fetch(`/api/guides/${guide.id}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, resolved }),
      });
      const data = (await res.json()) as { error?: string; thread?: ThreadState };
      if (!res.ok || !data.thread) {
        const message = data.error ?? `Could not ${resolved ? "resolve" : "unresolve"} the conversation`;
        flash(message, { error: true });
        return message;
      }
      const updated = data.thread;
      flash(updated.isResolved ? "Conversation resolved on GitHub" : "Conversation unresolved on GitHub");
      await comments.mutate(
        (d) => ({ comments: d?.comments ?? [], threads: [...(d?.threads ?? []).filter((t) => t.id !== updated.id), updated] }),
        { revalidate: false },
      );
      return null;
    },
    [guide.id, comments, flash],
  );

  async function toggleReviewed(sectionId: string, value?: boolean) {
    const next = value ?? !reviewed.has(sectionId);
    setCarried((prev) => {
      if (!prev.has(sectionId)) return prev;
      const m = new Map(prev);
      m.delete(sectionId);
      return m;
    });
    setReviewed((prev) => {
      const s = new Set(prev);
      if (next) s.add(sectionId);
      else s.delete(sectionId);
      return s;
    });
    await fetch(`/api/guides/${guide.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId, reviewed: next }),
    }).catch(() => null);
  }

  // diff: links from the markdown
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<CodeTarget>).detail;
      const current = step >= 1 && step <= sections.length ? sections[step - 1] : null;
      const inCurrent = current?.files.some((f) => f.path === t.path);
      if (!inCurrent && step !== -1) {
        const idx = sections.findIndex((s) => s.files.some((f) => f.path === t.path));
        setStep(idx >= 0 ? idx + 1 : -1);
      }
      setFocus({ ...t, nonce: Date.now() });
    };
    window.addEventListener("guide:goto", handler);
    return () => window.removeEventListener("guide:goto", handler);
  }, [step, sections]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "]") setStep((s) => Math.min(reviewStep, Math.max(0, s + 1)));
      if (e.key === "ArrowLeft" || e.key === "[") setStep((s) => Math.max(0, s - 1));
      if (e.key === "r" && step >= 1 && step <= sections.length) void toggleReviewed(sections[step - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reviewStep, sections]);

  const current = step >= 1 && step <= sections.length ? sections[step - 1] : null;
  const reviewedCount = sections.filter((s) => reviewed.has(s.id)).length;
  const progress = sections.map((s) => sectionProgress(s, reviewed, carried));
  const carriedCount = progress.filter((p) => p.kind === "carried").length;
  const rereviewCount = progress.filter((p) => p.kind === "rereview").length;
  const currentProgress = current ? progress[step - 1] : null;
  // The interdiff next to the code: against the version the viewer reviewed, else the one of their last visit.
  const currentChange =
    currentProgress?.kind === "rereview"
      ? currentProgress.change
      : current?.visitChange?.status === "changed" && currentProgress?.kind !== "carried"
        ? current.visitChange
        : null;
  const firstVisitChange = sections.findIndex((s) => s.visitChange);
  const showChanges = () => document.getElementById("section-changes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const blobBase = `${props.repo.htmlUrl}/blob/${guide.headSha}`;
  const generating = guide.status === "generating";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {props.sinceVisit ? (
        <SinceLastVisitBanner
          at={props.sinceVisit.at}
          baselineVersion={props.sinceVisit.baselineVersion}
          versions={props.sinceVisit.versions}
          newSections={sections.filter((s) => s.visitChange?.status === "new").length}
          changedSections={sections.filter((s) => s.visitChange?.status === "changed").length}
          newComments={commentList.filter((c) => c.isNew).length}
          onShow={firstVisitChange >= 0 ? () => setStep(firstVisitChange + 1) : undefined}
        />
      ) : null}
      {/* Stepper */}
      <nav className="flex items-stretch border-b border-solid border-black/15 bg-paper" aria-label="Guide sections">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          <StepTab label="Overview" index={null} active={step === 0} done={false} onClick={() => setStep(0)} />
          {sections.map((s, i) => (
            <StepTab
              key={s.id}
              label={s.title}
              index={i + 1}
              active={step === i + 1}
              done={reviewed.has(s.id)}
              mark={stepMark(progress[i], s.visitChange)}
              muted={s.generated}
              onClick={() => setStep(i + 1)}
            />
          ))}
          {generating ? (
            <div className="flex items-center gap-2 border-l border-dashed border-line px-4 font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase">
              <span className="dot animate-pulse-dot bg-blue-bright" /> Writing…
            </div>
          ) : (
            <StepTab label="Finish review" index={null} active={step === reviewStep} done={false} onClick={() => setStep(reviewStep)} />
          )}
        </div>
        <div className="flex flex-none items-center gap-1 border-l border-dashed border-line px-3">
          <span className="hidden font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase xl:inline">
            {reviewedCount}/{sections.length} reviewed
          </span>
          {carriedCount > 0 ? (
            <span className="hidden font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase xl:inline">· {carriedCount} carried</span>
          ) : null}
          {rereviewCount > 0 ? (
            <span className="hidden font-mono text-[10px] tracking-[0.08em] text-[#8a6d00] uppercase xl:inline">· {rereviewCount} to re-review</span>
          ) : null}
          <button
            type="button"
            className={clsx("btn btn-ghost btn-xs ml-2", step === -1 && "bg-black/[0.06] text-ink")}
            onClick={() => setStep(step === -1 ? 0 : -1)}
            title="Show every changed file"
          >
            <RiFileList3Line size={14} /> All files
          </button>
          {resolvedCount > 0 ? (
            <button
              type="button"
              className={clsx("btn btn-ghost btn-xs", showResolved && "bg-black/[0.06] text-ink")}
              onClick={() => setShowResolved(!showResolved)}
              title={`${resolvedCount} resolved conversation${resolvedCount === 1 ? "" : "s"} on this pull request`}
              aria-pressed={showResolved}
            >
              <RiCheckDoubleLine size={14} /> <span className="hidden sm:inline">Show resolved</span>
              <span className="font-mono text-[10px] text-black/50">{resolvedCount}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={clsx("btn btn-ghost btn-xs", wrap && "text-ink")}
            onClick={() => setWrap(!wrap)}
            title="Wrap long lines"
            aria-pressed={wrap}
          >
            <RiTextWrap size={14} /> Wrap
          </button>
        </div>
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,42%)_minmax(0,1fr)]">
        {/* Left: explanation */}
        <div ref={leftRef} className="min-h-0 overflow-y-auto border-r border-dashed border-line bg-paper grain">
          <div className="mx-auto max-w-[680px] px-6 py-8 lg:px-10">
            {generating || guide.status === "failed" ? (
              <GenerationStatus
                guideId={guide.id}
                status={guide.status}
                error={guide.error}
                sectionCount={sections.length}
                agentPrompt={props.agentPrompt}
                onChange={() => router.refresh()}
              />
            ) : null}

            {step === -1 ? (
              <FilesLeft files={files} sections={sections} onPick={(path) => setFocus({ path, start: null, end: null, side: "new", nonce: Date.now() })} />
            ) : step === 0 ? (
              <div className="animate-reveal">
                <span className="eyebrow">Guided PR · v{guide.version}</span>
                <h1 className="mt-6 font-serif text-[36px] leading-[1.02] tracking-[-0.035em] text-black lg:text-[44px]">{guide.title}</h1>
                <p className="mt-4 font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase">
                  {guide.author ? `${guide.author} · ` : ""}via {VIA_LABEL[guide.createdVia] ?? guide.createdVia} · {timeAgo(guide.createdAt)} · {sections.length} sections ·{" "}
                  {files.length} files
                </p>
                {guide.hasSummary ? <div className="mt-8">{guide.summary}</div> : null}
                <div className="mt-10 border-t border-dashed border-line pt-6">
                  <p className="mono-label">Sections</p>
                  <ol className="mt-3">
                    {sections.map((s, i) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setStep(i + 1)}
                          className="group flex w-full items-baseline gap-3 border-t border-dashed border-line py-3 text-left first:border-t-0"
                        >
                          <span className="font-mono text-[11px] text-black/45">{String(i + 1).padStart(2, "0")}</span>
                          <span className={clsx("flex-1 font-serif text-[20px] leading-[1.15] tracking-[-0.015em] group-hover:underline group-hover:underline-offset-4", s.generated ? "text-black/55" : "text-black")}>
                            {s.title}
                          </span>
                          <OverviewMark mark={stepMark(progress[i], s.visitChange)} progress={progress[i]} />
                          <span className="font-mono text-[10px] whitespace-nowrap text-black/45 uppercase">
                            {s.files.length} file{s.files.length === 1 ? "" : "s"}
                          </span>
                          {reviewed.has(s.id) ? (
                            <RiCheckboxCircleFill size={15} className={clsx("self-center", carried.has(s.id) ? "text-black/35" : "text-ink")} />
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {sections.length > 0 ? (
                    <button type="button" className="btn btn-primary btn-md mt-6" onClick={() => setStep(1)}>
                      Start with section 01 <RiArrowRightLine size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : step === reviewStep ? (
              <ReviewPanel
                guideId={guide.id}
                sections={sections}
                reviewed={reviewed}
                progress={progress}
                me={me}
                prUrl={props.pull.htmlUrl}
                onGoto={setStep}
                onDone={(text, href) => flash(text, { href })}
              />
            ) : current ? (
              <div className="animate-reveal" key={current.id}>
                <span className="eyebrow">
                  Section {String(step).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
                </span>
                <h2 className="mt-6 font-serif text-[32px] leading-[1.04] tracking-[-0.03em] text-black lg:text-[38px]">{current.title}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] tracking-[0.08em] text-black/50 uppercase">
                  <span>
                    {current.files.length} file{current.files.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    <span className="text-[#1f8a85]">+{current.additions}</span> <span className="text-danger">−{current.deletions}</span>
                  </span>
                  {current.reviewedBy.filter((u) => u !== me.id).length > 0 ? (
                    <span className="flex items-center gap-1.5">
                      Reviewed by
                      {current.reviewedBy
                        .filter((u) => u !== me.id)
                        .map((u) => {
                          const from = current.carriedFrom?.[u];
                          return (
                            <span
                              key={u}
                              className="flex items-center gap-0.5"
                              title={from === undefined ? members[u]?.name : `${members[u]?.name} (reviewed in v${from}, unchanged)`}
                            >
                              <Avatar src={members[u]?.avatarUrl} name={members[u]?.name} size={16} />
                              {from !== undefined ? <span className="text-black/40">v{from}</span> : null}
                            </span>
                          );
                        })}
                    </span>
                  ) : null}
                </div>
                {currentProgress ? (
                  <SectionNotice progress={currentProgress} visit={current.visitChange} version={guide.version} onShowChanges={showChanges} />
                ) : null}
                <div className="mt-8">{current.body}</div>
                <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-6">
                  <button
                    type="button"
                    className={clsx("btn btn-md", reviewed.has(current.id) ? "btn-secondary" : "btn-primary")}
                    onClick={async () => {
                      const wasReviewed = reviewed.has(current.id);
                      await toggleReviewed(current.id);
                      if (!wasReviewed) setStep((s) => Math.min(reviewStep, s + 1));
                    }}
                  >
                    {reviewed.has(current.id) ? (
                      <>
                        <RiCheckboxCircleFill size={15} /> Reviewed
                      </>
                    ) : (
                      <>
                        <RiCheckboxCircleLine size={15} /> Mark reviewed and continue
                      </>
                    )}
                  </button>
                  <div className="ml-auto flex gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} aria-label="Previous section">
                      <RiArrowLeftLine size={15} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep((s) => Math.min(reviewStep, s + 1))} aria-label="Next section">
                      <RiArrowRightLine size={15} />
                    </button>
                  </div>
                </div>
                <p className="mt-4 font-mono text-[10px] tracking-[0.08em] text-black/40 uppercase">
                  <span className="kbd">←</span> <span className="kbd">→</span> navigate · <span className="kbd">R</span> mark reviewed
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: code */}
        <div ref={rightRef} className="min-h-0 overflow-y-auto bg-wash">
          <div className="px-4 py-6 lg:px-6">
            {step === 0 ? (
              <OverviewRight
                files={files}
                sections={sections}
                coverage={props.coverage}
                onPick={(i) => setStep(i + 1)}
                progress={sections.length > 0 ? <ProgressCard progress={progress} /> : null}
              />
            ) : step === reviewStep ? (
              <ConversationRight
                comments={commentList}
                threads={threadStates}
                showResolved={showResolved}
                onShowResolved={() => setShowResolved(true)}
                loading={!comments.data}
                prUrl={props.pull.htmlUrl}
              />
            ) : (
              <>
                {currentChange && step !== -1 ? (
                  <div className="mb-4">
                    <InterdiffPanel
                      change={currentChange}
                      version={guide.version}
                      title={
                        currentProgress?.kind === "rereview"
                          ? `Changed since you reviewed v${currentChange.version}`
                          : `Changed since your last visit · v${currentChange.version}`
                      }
                    />
                  </div>
                ) : null}
                <SectionDiffs
                  guideId={guide.id}
                  files={step === -1 ? files : (current?.files ?? [])}
                  refs={step === -1 ? [] : (current?.refs ?? [])}
                  mode={step === -1 ? "all" : "section"}
                  threadsByPath={threadsByPath}
                  focus={focus}
                  blobBase={blobBase}
                  wrap={wrap}
                  onComment={onComment}
                  onReply={onReply}
                  onDelete={onDelete}
                  onResolve={threadStates ? onResolve : undefined}
                  showResolved={showResolved}
                  newSince={currentChange && step !== -1 ? currentChange : null}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className={clsx(
            "fixed right-6 bottom-6 z-50 flex items-center gap-3 border px-4 py-3 text-[13px]",
            toast.error ? "border-danger bg-white text-danger" : "border-ink bg-ink text-white",
          )}
        >
          {toast.text}
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
              View <RiExternalLinkLine size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepTab({
  label,
  index,
  active,
  done,
  mark,
  muted,
  onClick,
}: {
  label: string;
  index: number | null;
  active: boolean;
  done: boolean;
  /** Review state across versions (carried, re-review, new); defaults to done. */
  mark?: StepMark | null;
  muted?: boolean;
  onClick: () => void;
}) {
  const m = mark ?? (done ? { label: "done", tone: "done" as const } : null);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      title={label}
      className={clsx(
        "group relative flex h-14 max-w-[240px] min-w-[120px] flex-none flex-col justify-center gap-1 border-r border-dashed border-line px-4 text-left transition-colors",
        active ? "bg-ink text-white" : "hover:bg-black/[0.03]",
      )}
    >
      <span className={clsx("absolute inset-x-0 top-0 h-[2px]", m ? MARK_COLOR[m.tone] : "bg-transparent")} />
      <span
        className={clsx(
          "flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase",
          active ? "text-white/60" : "text-black/45",
        )}
      >
        <span className={clsx("dot", active ? "bg-signal" : m ? MARK_COLOR[m.tone] : "bg-[rgba(0,0,0,0.18)]")} />
        {index !== null ? String(index).padStart(2, "0") : active ? "Now" : "—"}
        {m ? ` · ${m.label}` : ""}
      </span>
      <span className={clsx("truncate font-serif text-[15px] leading-tight", active ? "text-white" : muted ? "text-black/50" : "text-black")}>
        {label}
      </span>
    </button>
  );
}

function OverviewRight({
  files,
  sections,
  coverage,
  onPick,
  progress,
}: {
  files: ViewerFile[];
  sections: ViewerSection[];
  coverage: { total: number; covered: number };
  onPick: (sectionIndex: number) => void;
  progress?: React.ReactNode;
}) {
  const pct = coverage.total === 0 ? 100 : Math.round((coverage.covered / coverage.total) * 100);
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 border border-black/15 bg-white">
        {[
          { label: "Files changed", value: files.length.toLocaleString("en") },
          { label: "Lines", value: `+${additions.toLocaleString("en")} −${deletions.toLocaleString("en")}` },
          { label: "Covered by sections", value: `${pct}%` },
        ].map((s, i) => (
          <div key={s.label} className={clsx("px-5 py-4", i > 0 && "border-l border-dashed border-line")}>
            <p className="font-serif text-[30px] leading-none tracking-[-0.03em] text-stat">{s.value}</p>
            <p className="mt-2 text-[13px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>
      {progress}
      <div className="border border-black/15 bg-white">
        <p className="mono-label border-b border-dashed border-line px-4 py-3">Changed files</p>
        <ul>
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-3 border-t border-dashed border-line px-4 py-2 first:border-t-0">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={f.path}>
                {f.path}
              </span>
              <span className="font-mono text-[11px] whitespace-nowrap">
                <span className="text-[#1f8a85]">+{f.additions}</span> <span className="text-danger">−{f.deletions}</span>
              </span>
              <span className="flex gap-1">
                {f.sections.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={clsx("tag hover:border-ink hover:text-ink", sections[i]?.generated && "text-black/40")}
                    onClick={() => onPick(i)}
                    title={sections[i]?.title}
                  >
                    §{String(i + 1).padStart(2, "0")}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FilesLeft({
  files,
  sections,
  onPick,
}: {
  files: ViewerFile[];
  sections: ViewerSection[];
  onPick: (path: string) => void;
}) {
  return (
    <div className="animate-reveal">
      <span className="eyebrow">All files</span>
      <h2 className="mt-6 font-serif text-[32px] leading-[1.04] tracking-[-0.03em] text-black">Every change in the pull request.</h2>
      <p className="lead mt-3">The full diff, without the guide. Select a file to jump to it.</p>
      <ul className="mt-8 border-t border-dashed border-line">
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onPick(f.path)}
              className="flex w-full items-center gap-2 border-b border-dashed border-line py-2 text-left hover:bg-black/[0.03]"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{f.path}</span>
              <span className="font-mono text-[10px] text-black/45 uppercase">
                {f.sections.map((i) => `§${String(i + 1).padStart(2, "0")}`).join(" ") || "—"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-[10px] tracking-[0.08em] text-black/40 uppercase">{sections.length} sections</p>
    </div>
  );
}

function ConversationRight({
  comments,
  threads,
  showResolved,
  onShowResolved,
  loading,
  prUrl,
}: {
  comments: ReviewComment[];
  threads: Map<string, ThreadState> | undefined;
  showResolved: boolean;
  onShowResolved: () => void;
  loading: boolean;
  prUrl: string;
}) {
  const isResolved = (c: ReviewComment) => Boolean(c.threadId && threads?.get(c.threadId)?.isResolved);
  const hidden = showResolved ? [] : comments.filter(isResolved);
  const hiddenThreads = new Set(hidden.map((c) => c.threadId)).size;
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) if (showResolved || !isResolved(c)) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="mono-label">Review comments on GitHub ({comments.length})</p>
        <a href={`${prUrl}/files`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs">
          Open on GitHub <RiExternalLinkLine size={13} />
        </a>
      </div>
      {loading ? <p className="text-[13px] text-muted">Loading comments…</p> : null}
      {!loading && comments.length === 0 ? <p className="text-[13px] text-muted">No review comments yet.</p> : null}
      {hiddenThreads > 0 ? (
        <p className="flex items-center gap-2 border border-dashed border-black/20 bg-white px-4 py-2 text-[12px] text-muted">
          <RiCheckDoubleLine size={14} className="text-olive" />
          {hiddenThreads} resolved conversation{hiddenThreads === 1 ? "" : "s"} hidden.
          <button type="button" className="link" onClick={onShowResolved}>
            Show resolved
          </button>
        </p>
      ) : null}
      {[...byFile.entries()].map(([path, list]) => (
        <div key={path} className="border border-black/15 bg-white">
          <p className="border-b border-dashed border-line bg-paper px-4 py-2 font-mono text-[12px] text-ink">{path}</p>
          <ul>
            {list.map((c) => (
              <li key={c.id} className="flex gap-3 border-t border-dashed border-line px-4 py-3 first:border-t-0">
                <Avatar src={c.user?.avatarUrl} name={c.user?.login} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-muted">
                    <span className="text-ink">{c.user?.login}</span> · line {c.line ?? c.originalLine}
                    {c.outdated ? " · outdated" : ""}
                    {isResolved(c) ? " · resolved" : ""} · {timeAgo(c.createdAt)}
                    {c.isNew ? <span className="tag ml-2 border-blue-bright/40 text-blue-bright">New</span> : null}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[13px] text-text">
                    {hasSuggestion(c.body) ? <span className="tag mr-2 align-middle">Suggestion</span> : null}
                    {hasSuggestion(c.body) ? bodyWithoutSuggestions(c.body) : c.body}
                  </p>
                </div>
                <a href={c.htmlUrl} target="_blank" rel="noreferrer" className="text-black/35 hover:text-ink" aria-label="Open on GitHub">
                  <RiExternalLinkLine size={13} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OverviewMark({ mark, progress }: { mark: StepMark | null; progress: SectionProgress }) {
  if (!mark || mark.tone === "done") return null;
  const text =
    progress.kind === "carried"
      ? `Reviewed in v${progress.version}`
      : progress.kind === "rereview"
        ? `Changed since v${progress.version}`
        : mark.tone === "new"
          ? "New"
          : "Changed";
  return (
    <span className="tag self-center">
      <span className={clsx("dot", MARK_COLOR[mark.tone])} /> {text}
    </span>
  );
}
