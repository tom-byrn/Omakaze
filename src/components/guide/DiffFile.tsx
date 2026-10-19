"use client";

import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiBracesLine,
  RiCornerDownRightLine,
  RiCornerRightUpLine,
  RiExpandUpDownLine,
  RiExternalLinkLine,
  RiFileCopy2Line,
} from "@remixicon/react";
import clsx from "clsx";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FileView } from "@/lib/diff/fileview";
import type { Tok } from "@/lib/diff/highlight";
import type { MoveLink } from "@/lib/diff/moves";
import type { SectionRef } from "@/lib/guides/refs";
import type { CodeTarget } from "@/components/markdown/CodeRefLink";
import { CommentThread, Composer } from "./CommentThread";
import { blocksOf, buildRows, functionRange, layoutItems, selectRows, type Row } from "./diff-model";
import { threadKey, type FocusTarget, type Thread } from "./types";

const STEP = 20;

const STATUS_TAG: Record<string, string> = {
  added: "added",
  removed: "deleted",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
  changed: "changed",
  unchanged: "unchanged",
};

function Code({ tokens, palette }: { tokens: Tok[]; palette: string[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span
          key={i}
          style={{
            color: t[1] ? palette[t[1]] : undefined,
            fontStyle: t[2] && t[2] & 1 ? "italic" : undefined,
            fontWeight: t[2] && t[2] & 2 ? 600 : undefined,
          }}
        >
          {t[0]}
        </span>
      ))}
    </>
  );
}

function MoveBanner({ move, path }: { move: MoveLink; path: string }) {
  const o = move.other;
  const lines = o.start === o.end ? `line ${o.start}` : `lines ${o.start}–${o.end}`;
  const where = o.path === path ? lines : `${o.path}:${o.start === o.end ? o.start : `${o.start}–${o.end}`}`;
  const Icon = move.side === "old" ? RiCornerRightUpLine : move.kind === "copied" ? RiFileCopy2Line : RiCornerDownRightLine;
  const label = move.side === "old" ? "Moved to" : move.kind === "copied" ? "Copied from" : "Moved from";
  return (
    <tr className="diff-move">
      <td colSpan={2} />
      <td>
        <button
          type="button"
          className="diff-move-link"
          title={`Go to ${o.path}`}
          onClick={() =>
            window.dispatchEvent(new CustomEvent<CodeTarget>("guide:goto", { detail: { path: o.path, start: o.start, end: o.end, side: o.side } }))
          }
        >
          <Icon size={13} />
          {label} <span className="font-mono">{where}</span>
        </button>
      </td>
    </tr>
  );
}

export type DiffFileProps = {
  view: FileView;
  refs: SectionRef[];
  /** "all" shows the whole diff (Files mode) */
  mode: "section" | "all";
  threads: Map<string, Thread[]> | undefined;
  focus: FocusTarget | null;
  blobUrl: string;
  wrap: boolean;
  onComment: (input: { path: string; line: number; side: "LEFT" | "RIGHT"; startLine?: number | null; body: string }) => Promise<string | null>;
  onReply: (rootId: number, body: string) => Promise<string | null>;
  onDelete?: (id: number) => Promise<string | null>;
  /** Lines that are new since an earlier guide version: added lines by new-side number, deleted lines by old-side number. */
  newSince?: { add: number[]; del: number[] };
};

export function DiffFile({ view, refs, mode, threads, focus, blobUrl, wrap, onComment, onReply, onDelete, newSince }: DiffFileProps) {
  const { rows, full } = useMemo(() => buildRows(view), [view]);
  const initial = useMemo(
    () => (mode === "all" ? selectRows(rows, [{ path: view.path }]) : selectRows(rows, refs)),
    [rows, refs, mode, view.path],
  );
  const [visible, setVisible] = useState<Uint8Array>(initial);
  const [collapsed, setCollapsed] = useState(false);
  const [composer, setComposer] = useState<{ index: number; start: number | null } | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ range: [number, number] | null; nonce: number } | null>(null);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [handledFocus, setHandledFocus] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset the selection when the section (refs) changes.
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setVisible(initial);
  }

  // A diff: link targets this file: reveal the lines (state derived during render).
  if (focus && focus.path === view.path && focus.nonce !== handledFocus) {
    setHandledFocus(focus.nonce);
    setCollapsed(false);
    let first = -1;
    let last = -1;
    rows.forEach((r, i) => {
      const n = focus.side === "old" ? r.old : r.new;
      if (n === null || focus.start === null) return;
      if (n >= focus.start && n <= (focus.end ?? focus.start)) {
        if (first === -1) first = i;
        last = i;
      }
    });
    if (first !== -1) {
      const next = visible.slice();
      for (let i = first; i <= last; i++) next[i] = 1;
      setVisible(next);
    }
    setFlash({ range: first === -1 ? null : [first, last], nonce: focus.nonce });
  }

  // Scroll to the highlighted lines, then fade the highlight.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      const target = flash.range ? containerRef.current?.querySelector(`[data-row="${flash.range[0]}"]`) : containerRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: flash.range ? "center" : "start" });
    }, 30);
    const clear = setTimeout(() => setFlash(null), 2600);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [flash]);

  const items = useMemo(() => layoutItems(rows, visible, view, full), [rows, visible, view, full]);
  // Rows of a block moved or copied elsewhere in the pull request: added lines carry where they came from, deleted lines where they went.
  const moveOf = useMemo(() => {
    const out = new Map<number, MoveLink>();
    for (const m of view.moves ?? []) {
      rows.forEach((r, i) => {
        const n = m.side === "new" ? (r.kind === "add" ? r.new : null) : r.kind === "del" ? r.old : null;
        if (n !== null && n >= m.start && n <= m.end) out.set(i, m);
      });
    }
    return out;
  }, [rows, view.moves]);
  const blocks = useMemo(() => blocksOf(visible), [visible]);
  const sinceSets = useMemo(() => (newSince ? { add: new Set(newSince.add), del: new Set(newSince.del) } : null), [newSince]);
  const reveal = (from: number, to: number) =>
    setVisible((v) => {
      const next = v.slice();
      for (let i = Math.max(0, from); i <= Math.min(rows.length - 1, to); i++) next[i] = 1;
      return next;
    });

  const notes = refs.filter((r) => r.note).map((r) => r.note!);
  const hiddenEverything = items.every((it) => it.type !== "row");

  function lineFor(row: Row): { line: number; side: "LEFT" | "RIGHT" } | null {
    if (row.kind === "del") return row.old !== null ? { line: row.old, side: "LEFT" } : null;
    return row.new !== null ? { line: row.new, side: "RIGHT" } : null;
  }

  function threadsFor(row: Row): Thread[] {
    const l = lineFor(row);
    if (!l || !threads) return [];
    const list = [...(threads.get(threadKey(l.side, l.line)) ?? [])];
    // A context line can carry LEFT-side comments too.
    if (row.kind === "context" && row.old !== null) list.push(...(threads.get(threadKey("LEFT", row.old)) ?? []));
    return list;
  }

  return (
    <div ref={containerRef} className="diff-file border border-black/15 bg-white" data-path={view.path}>
      <header className="sticky top-0 z-[5] flex items-center gap-2 border-b border-dashed border-line bg-paper px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-black/45 hover:text-ink"
          aria-label={collapsed ? "Expand file" : "Collapse file"}
        >
          {collapsed ? <RiArrowDownSLine size={16} /> : <RiArrowUpSLine size={16} />}
        </button>
        <span className="tag shrink-0">{STATUS_TAG[view.status] ?? view.status}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={view.path}>
          {view.previousPath && view.previousPath !== view.path ? (
            <>
              <span className="text-meta">{view.previousPath} → </span>
              {view.path}
            </>
          ) : (
            view.path
          )}
        </span>
        <span className="font-mono text-[11px] whitespace-nowrap">
          <span className="text-[#1f8a85]">+{view.additions}</span> <span className="text-danger">−{view.deletions}</span>
        </span>
        {!collapsed && rows.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setVisible(visible.every((v) => v === 1) ? initial : new Uint8Array(rows.length).fill(1))}
            title={full ? "Show the whole file" : "Show every changed line"}
          >
            <RiExpandUpDownLine size={13} />
            {visible.every((v) => v === 1) ? "Reset" : full ? "Whole file" : "All changes"}
          </button>
        ) : null}
        <a href={blobUrl} target="_blank" rel="noreferrer" className="text-black/40 hover:text-ink" aria-label="View file on GitHub">
          <RiExternalLinkLine size={14} />
        </a>
      </header>
      {!collapsed && notes.length > 0 ? (
        <div className="border-b border-dashed border-line bg-mist/50 px-4 py-2 font-mono text-[11px] leading-[17px] text-ui">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      ) : null}
      {collapsed ? null : view.binary ? (
        <p className="px-4 py-6 text-[13px] text-muted">Binary file or diff too large to display.</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted">{view.status === "renamed" ? "File renamed without changes." : "No changes."}</p>
      ) : (
        <div className={clsx("diff-scroll", wrap && "diff-wrap")}>
          <table className="diff-table">
            <colgroup>
              <col className="w-[48px]" />
              <col className="w-[48px]" />
              <col />
            </colgroup>
            <tbody>
              {hiddenEverything ? (
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-sans text-[12px] text-muted">
                    Lines from this file belong to other sections.{" "}
                    <button type="button" className="link" onClick={() => setVisible(new Uint8Array(rows.length).fill(1))}>
                      Show them
                    </button>
                  </td>
                </tr>
              ) : null}
              {items.map((it, idx) => {
                if (it.type === "unknown-gap") {
                  return (
                    <tr key={`u${idx}`} className="diff-hunk-header">
                      <td colSpan={2} />
                      <td>
                        {it.lines ? `⋯ ${it.lines} unchanged line${it.lines === 1 ? "" : "s"}` : "⋯"}
                        {it.header ? <span className="ml-3 text-black/45">{it.header}</span> : null}
                      </td>
                    </tr>
                  );
                }
                if (it.type === "gap") {
                  if (hiddenEverything) return null;
                  const prevBlock = blocks.find((b) => b[1] === it.from - 1);
                  const nextBlock = blocks.find((b) => b[0] === it.to + 1);
                  const fn = nextBlock ? functionRange(rows, nextBlock[0], nextBlock[1]) : prevBlock ? functionRange(rows, prevBlock[0], prevBlock[1]) : null;
                  const fnHelps = fn && (fn[0] <= it.to && fn[1] >= it.from);
                  const hunkGap = rows[it.from].inHunk;
                  return (
                    <tr key={`g${it.from}`} className="diff-gap">
                      <td colSpan={3}>
                        <div className="flex flex-wrap items-center gap-1 px-2 py-1">
                          {!it.leading && it.hidden > STEP ? (
                            <button type="button" className="diff-expand" onClick={() => reveal(it.from, it.from + STEP - 1)} title="Show more below">
                              <RiArrowDownSLine size={13} /> {STEP}
                            </button>
                          ) : null}
                          {!it.trailing && it.hidden > STEP ? (
                            <button type="button" className="diff-expand" onClick={() => reveal(it.to - STEP + 1, it.to)} title="Show more above">
                              <RiArrowUpSLine size={13} /> {STEP}
                            </button>
                          ) : null}
                          <button type="button" className="diff-expand" onClick={() => reveal(it.from, it.to)}>
                            <RiExpandUpDownLine size={13} />
                            {hunkGap ? `Show ${it.hidden} more line${it.hidden === 1 ? "" : "s"} from this change` : `Show ${it.hidden} unchanged line${it.hidden === 1 ? "" : "s"}`}
                          </button>
                          {fnHelps && fn ? (
                            <button type="button" className="diff-expand" onClick={() => reveal(fn[0], fn[1])} title="Expand to the enclosing function or block">
                              <RiBracesLine size={13} /> Enclosing block
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                }
                const i = it.index;
                const row = rows[i];
                const l = lineFor(row);
                const rowThreads = threadsFor(row);
                const inFlash = flash?.range && i >= flash.range[0] && i <= flash.range[1];
                const inRange = rangeStart !== null && composer && i >= Math.min(rangeStart, composer.index) && i <= Math.max(rangeStart, composer.index);
                const move = moveOf.get(i);
                const prev = items[idx - 1];
                const moveStarts = move && !(prev?.type === "row" && moveOf.get(prev.index) === move);
                return (
                  <Fragment key={i}>
                    {moveStarts ? <MoveBanner move={move} path={view.path} /> : null}
                    <tr
                      data-row={i}
                      className={clsx(
                        "diff-row group/row",
                        row.kind === "add" && "row-add",
                        row.kind === "del" && "row-del",
                        !row.inHunk && "row-expanded",
                        move && "row-moved",
                        sinceSets &&
                          (row.kind === "add" ? row.new !== null && sinceSets.add.has(row.new) : row.kind === "del" && row.old !== null && sinceSets.del.has(row.old)) &&
                          "row-since",
                        inFlash && "row-flash",
                        inRange && "row-selected",
                      )}
                    >
                      <td className="diff-num">{row.old ?? ""}</td>
                      <td className="diff-num relative">
                        {row.new ?? ""}
                        {row.inHunk && l ? (
                          <button
                            type="button"
                            className="diff-add-comment"
                            aria-label="Comment on this line"
                            title="Comment on this line (shift-click to select a range)"
                            onClick={(e) => {
                              if (e.shiftKey && composer) {
                                setRangeStart(composer.index);
                                setComposer({ index: i, start: composer.index });
                              } else {
                                setRangeStart(null);
                                setComposer({ index: i, start: null });
                              }
                            }}
                          >
                            <RiAddLine size={12} />
                          </button>
                        ) : null}
                      </td>
                      <td className="diff-code" data-marker={row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}>
                        <Code tokens={row.tokens} palette={view.palette} />
                      </td>
                    </tr>
                    {rowThreads.length > 0 ? (
                      <tr className="diff-thread-row">
                        <td colSpan={3}>
                          {rowThreads.map((t) => (
                            <CommentThread key={t.root.id} thread={t} onReply={onReply} onDelete={onDelete} />
                          ))}
                        </td>
                      </tr>
                    ) : null}
                    {composer?.index === i && l ? (
                      <tr className="diff-thread-row">
                        <td colSpan={3}>
                          <div className="my-2 mr-3 ml-[96px] border border-ink/40 bg-white">
                            {composer.start !== null ? (
                              <p className="border-b border-dashed border-line px-3 py-1.5 font-mono text-[11px] text-meta">
                                Lines {Math.min(lineFor(rows[composer.start])?.line ?? l.line, l.line)}–
                                {Math.max(lineFor(rows[composer.start])?.line ?? l.line, l.line)}
                              </p>
                            ) : null}
                            <Composer
                              onCancel={() => {
                                setComposer(null);
                                setRangeStart(null);
                              }}
                              onSubmit={async (body) => {
                                const startRow = composer.start !== null ? rows[composer.start] : null;
                                const startInfo = startRow ? lineFor(startRow) : null;
                                const err = await onComment({
                                  path: view.path,
                                  line: Math.max(l.line, startInfo?.line ?? l.line),
                                  side: l.side,
                                  startLine: startInfo && startInfo.side === l.side && startInfo.line !== l.line ? Math.min(startInfo.line, l.line) : null,
                                  body,
                                });
                                if (!err) {
                                  setComposer(null);
                                  setRangeStart(null);
                                }
                                return err;
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
