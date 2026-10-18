import type { Tok } from "@/lib/diff/highlight";
import type { FileView } from "@/lib/diff/fileview";
import type { SectionRef } from "@/lib/guides/refs";

export type Row = {
  kind: "context" | "add" | "del";
  old: number | null;
  new: number | null;
  /** Part of a diff hunk (GitHub accepts line comments only on these rows) */
  inHunk: boolean;
  hunk: number | null;
  tokens: Tok[];
};

export type Item =
  | { type: "row"; index: number }
  | { type: "gap"; from: number; to: number; hidden: number; leading: boolean; trailing: boolean }
  | { type: "unknown-gap"; lines: number | null; header: string };

const EMPTY: Tok[] = [["", 0]];

export function rowText(row: Row): string {
  return row.tokens.map((t) => t[0]).join("");
}

function hunkBounds(h: FileView["hunks"][number]) {
  const firstNew = h.newLines > 0 ? h.newStart : h.newStart + 1;
  const nextNew = h.newLines > 0 ? h.newStart + h.newLines : h.newStart + 1;
  const firstOld = h.oldLines > 0 ? h.oldStart : h.oldStart + 1;
  const nextOld = h.oldLines > 0 ? h.oldStart + h.oldLines : h.oldStart + 1;
  return { firstNew, nextNew, firstOld, nextOld };
}

/**
 * Flatten a file into rows. With full contents, unchanged lines between hunks
 * become hidden context rows that can be expanded; without, only hunk rows exist.
 */
export function buildRows(view: FileView): { rows: Row[]; full: boolean } {
  const rows: Row[] = [];
  const full = Boolean(view.newFile) && view.status !== "removed" && view.status !== "added";
  const newFile = view.newFile;

  const hunkRow = (hIdx: number, lIdx: number): Row => {
    const h = view.hunks[hIdx];
    const l = h.lines[lIdx];
    const fallback = view.hunkTokens?.[hIdx]?.[lIdx];
    let tokens: Tok[] | undefined;
    if (l.t === "d") tokens = (l.o !== null ? view.oldLines[l.o] : undefined) ?? fallback;
    else tokens = (l.n !== null ? newFile?.[l.n - 1] : undefined) ?? fallback;
    return {
      kind: l.t === "a" ? "add" : l.t === "d" ? "del" : "context",
      old: l.o,
      new: l.n,
      inHunk: true,
      hunk: h.index,
      tokens: tokens ?? EMPTY,
    };
  };

  if (!full || !newFile) {
    view.hunks.forEach((h, hIdx) => h.lines.forEach((_, lIdx) => rows.push(hunkRow(hIdx, lIdx))));
    return { rows, full: false };
  }

  let nextNew = 1;
  let offset = 0; // old = new + offset for unchanged lines
  view.hunks.forEach((h, hIdx) => {
    const b = hunkBounds(h);
    if (hIdx === 0) offset = b.firstOld - b.firstNew;
    for (let n = nextNew; n < b.firstNew; n++) {
      rows.push({ kind: "context", old: n + offset, new: n, inHunk: false, hunk: null, tokens: newFile[n - 1] ?? EMPTY });
    }
    h.lines.forEach((_, lIdx) => rows.push(hunkRow(hIdx, lIdx)));
    nextNew = b.nextNew;
    offset = b.nextOld - b.nextNew;
  });
  for (let n = nextNew; n <= newFile.length; n++) {
    rows.push({ kind: "context", old: n + offset, new: n, inHunk: false, hunk: null, tokens: newFile[n - 1] ?? EMPTY });
  }
  return { rows, full: true };
}

function position(rows: Row[], i: number, side: "new" | "old"): number {
  const direct = side === "new" ? rows[i].new : rows[i].old;
  if (direct !== null) return direct;
  for (let j = i - 1; j >= 0; j--) {
    const p = side === "new" ? rows[j].new : rows[j].old;
    if (p !== null) return p + 0.5;
  }
  return 0.5;
}

const MARGIN = 3;

/** Which rows a section shows initially. */
export function selectRows(rows: Row[], refs: SectionRef[]): Uint8Array {
  const visible = new Uint8Array(rows.length);
  for (const ref of refs) {
    const hasHunks = Boolean(ref.hunks && ref.hunks.length > 0);
    if (!hasHunks && !ref.lines) {
      rows.forEach((r, i) => {
        if (r.inHunk) visible[i] = 1;
      });
    } else {
      const picked: number[] = [];
      rows.forEach((r, i) => {
        if (hasHunks && (r.hunk === null || !ref.hunks!.includes(r.hunk))) return;
        if (ref.lines) {
          const p = position(rows, i, ref.lines.side ?? "new");
          if (!(p > ref.lines.start - 1 && p < ref.lines.end + 1)) return;
        }
        picked.push(i);
      });
      for (const i of picked) visible[i] = 1;
      if (ref.lines && picked.length > 0) {
        // A little unchanged context around line ranges.
        const first = picked[0];
        const last = picked[picked.length - 1];
        for (let k = 1; k <= MARGIN && first - k >= 0 && rows[first - k].kind === "context"; k++) visible[first - k] = 1;
        for (let k = 1; k <= MARGIN && last + k < rows.length && rows[last + k].kind === "context"; k++) visible[last + k] = 1;
      }
    }
    if (ref.expand === "file") visible.fill(1);
  }
  if (refs.some((r) => r.expand === "function")) {
    for (const block of blocksOf(visible)) {
      const range = functionRange(rows, block[0], block[1]);
      if (range) for (let i = range[0]; i <= range[1]; i++) visible[i] = 1;
    }
  }
  return visible;
}

/** Contiguous visible [start, end] index ranges. */
export function blocksOf(visible: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] && start === -1) start = i;
    if (!visible[i] && start !== -1) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  if (start !== -1) out.push([start, visible.length - 1]);
  return out;
}

function indentOf(s: string): number {
  const m = /^[ \t]*/.exec(s)?.[0] ?? "";
  return m.replace(/\t/g, "    ").length;
}

const CLOSER = /^\s*(\}|\)|\]|end\b|<\/|\};|\);|`;?)/;

/**
 * Enclosing block (function, class, object) of rows [s, e], found by indentation.
 * Climbs outwards until the block reaches beyond [s, e]; null when nothing encloses it.
 */
export function functionRange(rows: Row[], s: number, e: number): [number, number] | null {
  const text = (i: number) => rowText(rows[i]);
  let anchors: number[] = [];
  for (let i = s; i <= e; i++) if (rows[i].kind !== "context" && text(i).trim()) anchors.push(i);
  if (anchors.length === 0) for (let i = s; i <= e; i++) if (text(i).trim()) anchors.push(i);
  if (anchors.length === 0) return null;
  let lo = anchors[0];
  let hi = anchors[anchors.length - 1];
  let minIndent = Math.min(...anchors.map((i) => indentOf(text(i))));
  for (let level = 0; level < 12; level++) {
    if (minIndent === 0) return null;
    let opener = -1;
    for (let i = lo - 1; i >= 0; i--) {
      if (rows[i].kind === "del" || !text(i).trim()) continue;
      if (indentOf(text(i)) < minIndent) {
        opener = i;
        break;
      }
    }
    if (opener === -1) return null;
    const openerIndent = indentOf(text(opener));
    // Include decorators / doc comments directly above the opener.
    let top = opener;
    for (let i = opener - 1; i >= 0; i--) {
      if (rows[i].kind === "del" || !text(i).trim() || indentOf(text(i)) !== openerIndent) break;
      if (/^\s*(@|\/\/|\*|\/\*|#)/.test(text(i))) top = i;
      else break;
    }
    let closer = rows.length - 1;
    for (let i = hi + 1; i < rows.length; i++) {
      if (rows[i].kind === "del" || !text(i).trim()) continue;
      if (indentOf(text(i)) <= openerIndent) {
        closer = CLOSER.test(text(i)) ? i : i - 1;
        break;
      }
    }
    if (top < s || closer > e) return [Math.min(top, s), Math.max(closer, e)];
    lo = top;
    hi = closer;
    minIndent = openerIndent;
  }
  return null;
}

function lastNewBefore(rows: Row[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (rows[j].new !== null) return rows[j].new!;
  return 0;
}

/**
 * Interleave visible rows with expandable gaps. Without full file contents,
 * markers show where unchanged lines exist that cannot be loaded.
 */
export function layoutItems(rows: Row[], visible: Uint8Array, view: FileView, full: boolean): Item[] {
  const items: Item[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!full && (i === 0 || rows[i - 1].hunk !== rows[i].hunk)) {
      const h = view.hunks.find((x) => x.index === rows[i].hunk);
      const firstNew = h ? (h.newLines > 0 ? h.newStart : h.newStart + 1) : null;
      const between = firstNew !== null ? firstNew - lastNewBefore(rows, i) - 1 : null;
      if (between === null || between > 0) items.push({ type: "unknown-gap", lines: between, header: h?.heading ?? "" });
    }
    if (visible[i]) {
      items.push({ type: "row", index: i });
      i++;
      continue;
    }
    const from = i;
    while (i < rows.length && !visible[i] && (full || rows[i].hunk === rows[from].hunk)) i++;
    items.push({ type: "gap", from, to: i - 1, hidden: i - from, leading: from === 0, trailing: i === rows.length });
  }
  return items;
}

/** Hide everything when a file has nothing selected (e.g. only other sections use it). */
export function hasVisible(visible: Uint8Array): boolean {
  for (let i = 0; i < visible.length; i++) if (visible[i]) return true;
  return false;
}
