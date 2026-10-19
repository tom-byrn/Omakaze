"use client";

import { RiArrowDownSLine, RiArrowUpSLine, RiCheckboxCircleFill, RiCloseLine } from "@remixicon/react";
import clsx from "clsx";
import { Fragment, useState } from "react";
import { plural, timeAgo } from "@/lib/format";
import type { FileInterdiff, SectionChange } from "@/lib/guides/carryover";

/** The viewer's review state of a section, across versions. */
export type SectionProgress =
  | { kind: "reviewed" }
  /** Reviewed in an earlier version that covered the same code. */
  | { kind: "carried"; version: number }
  /** Reviewed in an earlier version, but the code changed since. */
  | { kind: "rereview"; version: number; change: SectionChange }
  | { kind: "none" };

export function sectionProgress(
  section: { id: string; reviewChange?: SectionChange | null },
  reviewed: Set<string>,
  carried: Map<string, number>,
): SectionProgress {
  if (reviewed.has(section.id)) {
    const version = carried.get(section.id);
    return version === undefined ? { kind: "reviewed" } : { kind: "carried", version };
  }
  if (section.reviewChange) return { kind: "rereview", version: section.reviewChange.version, change: section.reviewChange };
  return { kind: "none" };
}

export type StepMark = { label: string; tone: "done" | "carried" | "changed" | "new" };

/** Short label for a step tab: the review state first, then what is new since the last visit. */
export function stepMark(progress: SectionProgress, visit: SectionChange | null | undefined): StepMark | null {
  if (progress.kind === "reviewed") return { label: "done", tone: "done" };
  if (progress.kind === "carried") return { label: "carried", tone: "carried" };
  if (progress.kind === "rereview") return { label: "re-review", tone: "changed" };
  if (visit?.status === "new") return { label: "new", tone: "new" };
  if (visit?.status === "changed") return { label: "changed", tone: "changed" };
  return null;
}

export const MARK_COLOR: Record<StepMark["tone"], string> = {
  done: "bg-ink",
  carried: "bg-ink/35",
  changed: "bg-highlight",
  new: "bg-blue-bright",
};

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "3 lines new or changed and 2 removed in src/a.ts; now also covers src/b.ts" */
export function describeChange(files: FileInterdiff[]): string {
  return files
    .map((f) => {
      if (f.status === "added") return `now covers ${f.path}`;
      if (f.status === "removed") return `no longer covers ${f.path}`;
      if (f.opaque) return `${f.path} changed`;
      const parts = [f.added > 0 ? `${plural(f.added, "line")} new or changed` : "", f.removed > 0 ? `${f.removed} removed` : ""].filter(Boolean);
      return `${joinWords(parts)} in ${f.path}`;
    })
    .join("; ");
}

/* ------------------------------------------------------------------ */
/* Banner                                                              */
/* ------------------------------------------------------------------ */

export function SinceLastVisitBanner({
  at,
  baselineVersion,
  versions,
  newSections,
  changedSections,
  newComments,
  onShow,
}: {
  at: string;
  baselineVersion: number;
  versions: number[];
  newSections: number;
  changedSections: number;
  newComments: number;
  /** Open the first new or changed section; omitted when there is none. */
  onShow?: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const published = versions.length === 1 ? `Version ${versions[0]} was` : `Versions ${joinWords(versions.map(String))} were`;
  const parts = [
    newSections > 0 ? plural(newSections, "new section") : "",
    changedSections > 0 ? plural(changedSections, "changed section") : "",
  ].filter(Boolean);
  return (
    <div
      role="region"
      aria-label="New since your last visit"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-dashed border-line bg-mist px-4 py-2 text-[12px] text-ink lg:px-6"
    >
      <span className="dot bg-blue-bright" />
      <span>
        {published} published since your last visit {timeAgo(at)}.
      </span>
      <span className="text-body">
        Compared to version {baselineVersion}: {parts.length > 0 ? joinWords(parts) : "no section changed"}
        {newComments > 0 ? `, ${plural(newComments, "new comment")}` : ""}.
      </span>
      {onShow ? (
        <button type="button" className="link" onClick={onShow}>
          Show changes
        </button>
      ) : null}
      <button type="button" className="ml-auto text-black/40 hover:text-ink" aria-label="Dismiss" onClick={() => setHidden(true)}>
        <RiCloseLine size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section notice (left pane)                                          */
/* ------------------------------------------------------------------ */

export function SectionNotice({
  progress,
  visit,
  version,
  onShowChanges,
}: {
  progress: SectionProgress;
  visit: SectionChange | null | undefined;
  /** This guide's version. */
  version: number;
  onShowChanges: () => void;
}) {
  if (progress.kind === "carried") {
    return (
      <div className="mt-6 flex items-start gap-3 border border-dashed border-line bg-white px-4 py-3 text-[13px] leading-[20px] text-text">
        <RiCheckboxCircleFill size={16} className="mt-0.5 flex-none text-black/40" />
        <p>
          <span className="text-ink">Reviewed in v{progress.version}, unchanged.</span> This section covers the same changed lines as when you
          reviewed it in version {progress.version}, so your mark carried over to version {version}.
        </p>
      </div>
    );
  }
  if (progress.kind === "rereview") {
    return (
      <div className="mt-6 border border-[#b08d00]/40 bg-highlight/15 px-4 py-3" role="note" aria-label="Changed since you reviewed">
        <p className="mono-label text-[#8a6d00]">Changed since you reviewed v{progress.version}</p>
        <p className="mt-1 text-[13px] leading-[20px] text-text">{describeChange(progress.change.files)}.</p>
        <button type="button" className="link mt-2 text-[13px]" onClick={onShowChanges}>
          Show what changed
        </button>
      </div>
    );
  }
  if (progress.kind === "reviewed" || !visit) return null;
  return (
    <div className="mt-6 border border-dashed border-blue-bright/40 bg-mist px-4 py-3" role="note" aria-label="New since your last visit">
      <p className="mono-label text-blue-deep">{visit.status === "new" ? "New since your last visit" : "Changed since your last visit"}</p>
      <p className="mt-1 text-[13px] leading-[20px] text-text">
        {visit.status === "new"
          ? `Version ${visit.version} had no section covering this code.`
          : `Compared to version ${visit.version}: ${describeChange(visit.files)}.`}
      </p>
      {visit.status === "changed" ? (
        <button type="button" className="link mt-2 text-[13px]" onClick={onShowChanges}>
          Show what changed
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interdiff (right pane)                                              */
/* ------------------------------------------------------------------ */

const FILE_STATUS: Record<FileInterdiff["status"], string> = {
  added: "now in section",
  removed: "no longer in section",
  changed: "changed",
};

function InterdiffFile({ file, from, to }: { file: FileInterdiff; from: number; to: number }) {
  return (
    <div className="border-t border-dashed border-line first:border-t-0" data-interdiff-path={file.path}>
      <div className="flex items-center gap-2 bg-paper px-3 py-1.5">
        <span className="tag shrink-0">{FILE_STATUS[file.status]}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={file.path}>
          {file.path}
        </span>
        {!file.opaque ? (
          <span className="font-mono text-[11px] whitespace-nowrap text-black/55">
            {file.added} new · {file.removed} removed
          </span>
        ) : null}
      </div>
      {file.opaque ? (
        <p className="px-4 py-3 text-[12px] text-muted">Binary file or diff too large to compare line by line.</p>
      ) : (
        <div className="diff-scroll diff-wrap">
          <table className="diff-table interdiff-table">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[48px]" />
              <col />
            </colgroup>
            <tbody>
              {file.chunks.map((c, ci) => (
                <Fragment key={ci}>
                  {c.skipped > 0 ? (
                    <tr className="diff-hunk-header">
                      <td colSpan={2} />
                      <td>⋯ {plural(c.skipped, "unchanged line")}</td>
                    </tr>
                  ) : null}
                  {c.rows.map((r, ri) => (
                    <tr key={ri} className={clsx("diff-row", `interdiff-${r.op}`)} data-op={r.op}>
                      <td className="diff-num interdiff-version">{r.op === "added" ? `v${to}` : r.op === "removed" ? `v${from}` : ""}</td>
                      <td className="diff-num">{r.line}</td>
                      <td className="diff-code" data-marker={r.type === "add" ? "+" : "−"}>
                        {r.content || " "}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {file.trailing > 0 ? (
                <tr className="diff-hunk-header">
                  <td colSpan={2} />
                  <td>⋯ {plural(file.trailing, "unchanged line")}</td>
                </tr>
              ) : null}
              {file.truncated ? (
                <tr className="diff-hunk-header">
                  <td colSpan={2} />
                  <td>More differences are not shown.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The interdiff of a section: the changed lines it covers now compared with an earlier version.
 * Rows only in the newer version are marked with its number, rows that are gone with the older one.
 */
export function InterdiffPanel({ change, title, version }: { change: SectionChange; title: string; version: number }) {
  const [open, setOpen] = useState(true);
  const added = change.files.reduce((n, f) => n + f.added, 0);
  const removed = change.files.reduce((n, f) => n + f.removed, 0);
  return (
    <section id="section-changes" aria-label="What changed" className="scroll-mt-4 border border-[#b08d00]/40 bg-white">
      <header className="flex items-center gap-2 border-b border-dashed border-[#b08d00]/30 bg-highlight/15 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-black/45 hover:text-ink" aria-label={open ? "Collapse changes" : "Expand changes"}>
          {open ? <RiArrowUpSLine size={16} /> : <RiArrowDownSLine size={16} />}
        </button>
        <span className="mono-label text-[#6b5a00]">{title}</span>
        <span className="ml-auto font-mono text-[11px] whitespace-nowrap text-black/55">
          {plural(change.files.length, "file")} · {added} new · {removed} removed
        </span>
      </header>
      {open ? (
        <>
          <p className="border-b border-dashed border-line px-4 py-2 text-[12px] leading-[18px] text-body">
            Changed lines this section covers in version {version} that differ from version {change.version}. In the diff below, lines that are new since
            version {change.version} have a yellow bar.
          </p>
          {change.files.map((f) => (
            <InterdiffFile key={f.path} file={f} from={change.version} to={version} />
          ))}
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Progress summary (overview)                                         */
/* ------------------------------------------------------------------ */

export function ProgressCard({ progress }: { progress: SectionProgress[] }) {
  const count = (kind: SectionProgress["kind"]) => progress.filter((p) => p.kind === kind).length;
  const segments = [
    { label: "reviewed", n: count("reviewed"), color: "bg-ink" },
    { label: "carried over", n: count("carried"), color: "bg-ink/35" },
    { label: "to re-review", n: count("rereview"), color: "bg-highlight" },
    { label: "not reviewed", n: count("none"), color: "bg-black/[0.08]" },
  ];
  const total = progress.length || 1;
  return (
    <div className="border border-black/15 bg-white" aria-label="Your review progress" role="group">
      <p className="mono-label border-b border-dashed border-line px-4 py-3">Your review</p>
      <div className="px-4 py-4">
        <div className="flex h-2 w-full bg-wash">
          {segments.map((s) => (s.n > 0 ? <span key={s.label} className={s.color} style={{ width: `${(s.n / total) * 100}%` }} /> : null))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={clsx("dot", s.color)} />
              <span className="text-ink">{s.n}</span> {s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
