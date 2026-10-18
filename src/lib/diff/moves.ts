import { parsePatch } from "./parse";
import type { DiffFile } from "./types";

export type MoveKind = "moved" | "copied";

/** A block of lines that was moved or copied, seen from one of its two ends. */
export type MoveLink = {
  kind: MoveKind;
  /** "new": added lines of this file (the destination). "old": deleted lines of this file (a move's source). */
  side: "new" | "old";
  start: number;
  end: number;
  /** The other end: where the lines came from (old side) or went to (new side) */
  other: { path: string; side: "new" | "old"; start: number; end: number };
};

/** Old-side lines of one file the added code may have come from. */
type Source = {
  path: string;
  oldStart: number;
  text: string[];
  deleted: boolean[];
  /** Hunk of each deleted line (an edit inside one hunk is not a move) */
  hunk: (number | null)[];
};

type Run = { path: string; hunk: number; newStart: number; text: string[] };

const MIN_LINES = 3;
/** Word characters a block needs, so runs of braces and blank lines never count */
const MIN_WEIGHT = 40;
const MAX_CANDIDATES = 200;

function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function weight(line: string): number {
  return line.match(/\w/g)?.length ?? 0;
}

/**
 * Find blocks of added lines that also exist on the old side of the pull request:
 * "moved" when the original lines were deleted, "copied" when they stayed.
 * `base` holds the full base contents of files where available; other files
 * contribute only the deleted and context lines of their patch.
 */
export function detectMoves(files: DiffFile[], base: Map<string, string[]> = new Map()): Map<string, MoveLink[]> {
  const sources: Source[] = [];
  const runs: Run[] = [];

  for (const f of files) {
    if (f.patch === null) continue;
    const hunks = parsePatch(f.patch);
    const delHunk = new Map<number, number>();
    for (const h of hunks) {
      for (const l of h.lines) if (l.type === "del" && l.oldNumber !== null) delHunk.set(l.oldNumber, h.index);
      let run: Run | null = null;
      for (const l of h.lines) {
        if (l.type === "add" && l.newNumber !== null) {
          if (!run) runs.push((run = { path: f.path, hunk: h.index, newStart: l.newNumber, text: [] }));
          run.text.push(normalize(l.content));
        } else if (l.type !== "add") run = null;
      }
    }
    if (f.status === "added") continue;
    const lines = base.get(f.path);
    if (lines) {
      sources.push({
        path: f.path,
        oldStart: 1,
        text: lines.map(normalize),
        deleted: lines.map((_, i) => delHunk.has(i + 1)),
        hunk: lines.map((_, i) => delHunk.get(i + 1) ?? null),
      });
      continue;
    }
    for (const h of hunks) {
      const old = h.lines.filter((l) => l.type !== "add" && l.oldNumber !== null);
      if (old.length === 0) continue;
      sources.push({
        path: f.path,
        oldStart: old[0].oldNumber!,
        text: old.map((l) => normalize(l.content)),
        deleted: old.map((l) => l.type === "del"),
        hunk: old.map((l) => (l.type === "del" ? h.index : null)),
      });
    }
  }

  // Index the old side by line, skipping lines too plain to anchor a match.
  const index = new Map<string, [number, number][]>();
  sources.forEach((s, si) =>
    s.text.forEach((t, p) => {
      if (weight(t) < 4) return;
      const list = index.get(t) ?? [];
      if (list.length < MAX_CANDIDATES) list.push([si, p]);
      index.set(t, list);
    }),
  );

  const found: { run: Run; a: number; si: number; p: number; len: number }[] = [];
  for (const run of runs) {
    let floor = 0;
    let i = 0;
    while (i < run.text.length) {
      let best: { a: number; b: number; si: number; p: number; deleted: number } | null = null;
      for (const [si, p] of index.get(run.text[i]) ?? []) {
        const s = sources[si];
        if (s.path === run.path && s.hunk[p] === run.hunk) continue;
        let back = 0;
        while (i - back - 1 >= floor && p - back - 1 >= 0 && run.text[i - back - 1] === s.text[p - back - 1]) back++;
        let fwd = 0;
        while (i + fwd + 1 < run.text.length && p + fwd + 1 < s.text.length && run.text[i + fwd + 1] === s.text[p + fwd + 1]) fwd++;
        const len = back + fwd + 1;
        let deleted = 0;
        for (let k = p - back; k <= p + fwd; k++) if (s.deleted[k]) deleted++;
        if (!best || len > best.b - best.a + 1 || (len === best.b - best.a + 1 && deleted > best.deleted)) {
          best = { a: i - back, b: i + fwd, si, p: p - back, deleted };
        }
      }
      if (!best) {
        i++;
        continue;
      }
      // Blank lines at either end belong to the surroundings, not the block.
      let { a, b, p } = best;
      while (a <= b && run.text[a] === "") {
        a++;
        p++;
      }
      while (b >= a && run.text[b] === "") b--;
      const len = b - a + 1;
      let w = 0;
      for (let k = a; k <= b; k++) w += weight(run.text[k]);
      if (len < MIN_LINES || w < MIN_WEIGHT) {
        i++;
        continue;
      }
      found.push({ run, a, si: best.si, p, len });
      i = floor = best.b + 1;
    }
  }

  // Deleted lines move to one place: the longest block claims them, any other block is a copy.
  const out = new Map<string, MoveLink[]>();
  const add = (path: string, link: MoveLink) => out.set(path, [...(out.get(path) ?? []), link]);
  const claimed = new Set<string>();
  for (const { run, a, si, p, len } of found.sort((x, y) => y.len - x.len)) {
    const s = sources[si];
    const deleted: string[] = [];
    for (let k = p; k < p + len; k++) if (s.deleted[k]) deleted.push(`${si}:${k}`);
    const kind: MoveKind = deleted.length * 2 >= len && !deleted.some((d) => claimed.has(d)) ? "moved" : "copied";
    const dest = { path: run.path, side: "new" as const, start: run.newStart + a, end: run.newStart + a + len - 1 };
    const src = { path: s.path, side: "old" as const, start: s.oldStart + p, end: s.oldStart + p + len - 1 };
    add(run.path, { kind, side: "new", start: dest.start, end: dest.end, other: src });
    if (kind === "moved") {
      for (const d of deleted) claimed.add(d);
      add(s.path, { kind, side: "old", start: src.start, end: src.end, other: dest });
    }
  }
  for (const links of out.values()) links.sort((x, y) => x.side.localeCompare(y.side) || x.start - y.start);
  return out;
}
