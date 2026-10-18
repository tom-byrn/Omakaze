import type { DiffHunk, DiffLine, ParsedFile } from "@/lib/diff/types";

/** A reference from a guide section to part of the diff. */
export type SectionRef = {
  path: string;
  /** 1-based hunk indexes within the file. Omitted with no `lines` = the whole file. */
  hunks?: number[];
  /** Line range. `side: "new"` (default) uses head line numbers, `"old"` uses base line numbers. */
  lines?: { start: number; end: number; side?: "new" | "old" };
  /** Short caption shown above this part of the diff. */
  note?: string;
  /** Initial context expansion when rendered. */
  expand?: "none" | "function" | "file";
};

export type RefInput = string | SectionRef;

const HUNK_SUFFIX = /^(.*)#(\d+(?:\s*[-,]\s*\d+)*)$/;
const LINE_SUFFIX = /^(.*?):(old:|new:)?L?(\d+)(?:\s*-\s*L?(\d+))?$/;

function expandNumberList(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((s) => Number(s.trim()));
    if (!Number.isFinite(a)) continue;
    if (Number.isFinite(b) && b >= a) for (let i = a; i <= b; i++) out.add(i);
    else out.add(a);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * Parse string references:
 *   "src/a.ts"            whole file
 *   "src/a.ts#2"          hunk 2      ("#1,3" or "#1-3" for several)
 *   "src/a.ts:10-40"      new-side lines 10-40 ("L10-L40" also accepted)
 *   "src/a.ts:old:10-40"  base-side lines
 */
export function parseRefString(input: string, knownPaths?: Set<string>): SectionRef {
  const s = input.trim();
  if (knownPaths?.has(s)) return { path: s };
  const hunk = HUNK_SUFFIX.exec(s);
  if (hunk && (!knownPaths || knownPaths.has(hunk[1]))) {
    return { path: hunk[1], hunks: expandNumberList(hunk[2]) };
  }
  const lines = LINE_SUFFIX.exec(s);
  if (lines && (!knownPaths || knownPaths.has(lines[1]))) {
    const start = Number(lines[3]);
    const end = lines[4] ? Number(lines[4]) : start;
    return {
      path: lines[1],
      lines: { start: Math.min(start, end), end: Math.max(start, end), side: lines[2] === "old:" ? "old" : "new" },
    };
  }
  return { path: s };
}

export function normalizeRef(input: RefInput, knownPaths?: Set<string>): SectionRef {
  if (typeof input === "string") return parseRefString(input, knownPaths);
  const ref: SectionRef = { path: input.path.trim() };
  if (input.hunks && input.hunks.length > 0) ref.hunks = [...new Set(input.hunks)].sort((a, b) => a - b);
  if (input.lines) {
    const start = Math.min(input.lines.start, input.lines.end);
    const end = Math.max(input.lines.start, input.lines.end);
    ref.lines = { start, end, side: input.lines.side === "old" ? "old" : "new" };
  }
  if (input.note) ref.note = input.note;
  if (input.expand) ref.expand = input.expand;
  return ref;
}

export function formatRef(ref: SectionRef): string {
  if (ref.hunks?.length) return `${ref.path}#${ref.hunks.join(",")}`;
  if (ref.lines) {
    const side = ref.lines.side === "old" ? "old:" : "";
    return ref.lines.start === ref.lines.end
      ? `${ref.path}:${side}${ref.lines.start}`
      : `${ref.path}:${side}${ref.lines.start}-${ref.lines.end}`;
  }
  return ref.path;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type RefProblem = { ref: string; level: "error" | "warning"; message: string };

function closestPaths(path: string, files: ParsedFile[]): string[] {
  const base = path.split("/").pop() ?? path;
  return files
    .map((f) => f.path)
    .filter((p) => p.endsWith(base) || p.includes(path) || path.includes(p))
    .slice(0, 3);
}

/** Check references against a diff. Errors make a ref unusable; warnings are informational. */
export function validateRefs(refs: SectionRef[], files: ParsedFile[]): RefProblem[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const problems: RefProblem[] = [];
  for (const ref of refs) {
    const label = formatRef(ref);
    const file = byPath.get(ref.path);
    if (!file) {
      const suggestions = closestPaths(ref.path, files);
      problems.push({
        ref: label,
        level: "error",
        message: `File is not part of this pull request.${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""}`,
      });
      continue;
    }
    if (ref.hunks) {
      const bad = ref.hunks.filter((h) => h < 1 || h > file.hunks.length);
      if (bad.length > 0) {
        problems.push({
          ref: label,
          level: "error",
          message: `Hunk ${bad.join(", ")} does not exist. ${file.path} has ${file.hunks.length} hunk(s).`,
        });
      }
    }
    if (ref.lines && file.hunks.length > 0) {
      const touches = file.hunks.some((h) => rangeTouchesHunk(ref.lines!, h));
      if (!touches) {
        problems.push({
          ref: label,
          level: "warning",
          message: "Line range does not overlap any changed lines; it will be shown as unchanged context.",
        });
      }
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Line selection and coverage                                         */
/* ------------------------------------------------------------------ */

/**
 * Position of a diff line on the given side. Deleted lines have no new-side number,
 * so they sit half way after the preceding new-side line (and vice versa for added lines).
 */
export function linePosition(hunk: DiffHunk, lineIndex: number, side: "new" | "old"): number {
  const line = hunk.lines[lineIndex];
  const direct = side === "new" ? line.newNumber : line.oldNumber;
  if (direct !== null) return direct;
  for (let i = lineIndex - 1; i >= 0; i--) {
    const prev = side === "new" ? hunk.lines[i].newNumber : hunk.lines[i].oldNumber;
    if (prev !== null) return prev + 0.5;
  }
  const start = side === "new" ? hunk.newStart : hunk.oldStart;
  return start - 0.5;
}

function rangeTouchesHunk(range: NonNullable<SectionRef["lines"]>, hunk: DiffHunk): boolean {
  const side = range.side ?? "new";
  for (let i = 0; i < hunk.lines.length; i++) {
    if (hunk.lines[i].type === "context") continue;
    const p = linePosition(hunk, i, side);
    if (p > range.start - 1 && p < range.end + 1) return true;
  }
  return false;
}

/** Whether `ref` selects line `lineIndex` of hunk `hunk` in `file`. */
export function refSelectsLine(ref: SectionRef, file: ParsedFile, hunk: DiffHunk, lineIndex: number): boolean {
  if (ref.path !== file.path) return false;
  if (ref.hunks && ref.hunks.length > 0) {
    if (!ref.hunks.includes(hunk.index)) return false;
    if (!ref.lines) return true;
  }
  if (ref.lines) {
    const side = ref.lines.side ?? "new";
    const p = linePosition(hunk, lineIndex, side);
    return p > ref.lines.start - 1 && p < ref.lines.end + 1;
  }
  return true;
}

export type UncoveredRange = {
  path: string;
  hunk: number;
  /** Line range on the new side (old side for deleted files) */
  start: number;
  end: number;
  side: "new" | "old";
  changedLines: number;
  wholeHunk: boolean;
};

export type Coverage = {
  totalChanged: number;
  coveredChanged: number;
  uncovered: UncoveredRange[];
  /** path -> section indexes (0-based) that reference the file */
  fileSections: Record<string, number[]>;
};

/** Compute which changed lines of the diff are referenced by at least one section. */
export function computeCoverage(files: ParsedFile[], sections: { refs: SectionRef[] }[]): Coverage {
  let totalChanged = 0;
  let coveredChanged = 0;
  const uncovered: UncoveredRange[] = [];
  const fileSections: Record<string, number[]> = {};

  sections.forEach((s, idx) => {
    for (const r of s.refs) {
      const list = (fileSections[r.path] ??= []);
      if (!list.includes(idx)) list.push(idx);
    }
  });

  for (const file of files) {
    const refs = sections.flatMap((s) => s.refs.filter((r) => r.path === file.path));
    const side: "new" | "old" = file.status === "removed" ? "old" : "new";
    for (const hunk of file.hunks) {
      let hunkChanged = 0;
      let hunkUncovered = 0;
      let run: { start: number; end: number; count: number } | null = null;
      const runs: { start: number; end: number; count: number }[] = [];
      hunk.lines.forEach((line: DiffLine, i: number) => {
        if (line.type === "context") return;
        totalChanged++;
        hunkChanged++;
        const covered = refs.some((r) => refSelectsLine(r, file, hunk, i));
        if (covered) {
          coveredChanged++;
          if (run) runs.push(run);
          run = null;
          return;
        }
        hunkUncovered++;
        const pos = linePosition(hunk, i, side);
        const lineNo = Math.max(1, Math.round(pos));
        if (run) {
          run.end = Math.max(run.end, lineNo);
          run.count++;
        } else run = { start: lineNo, end: lineNo, count: 1 };
      });
      if (run) runs.push(run);
      for (const r of runs) {
        uncovered.push({
          path: file.path,
          hunk: hunk.index,
          start: r.start,
          end: r.end,
          side,
          changedLines: r.count,
          wholeHunk: hunkUncovered === hunkChanged,
        });
      }
    }
  }
  return { totalChanged, coveredChanged, uncovered, fileSections };
}

/** Build refs that cover the uncovered parts of the diff (for an automatic "Other changes" section). */
export function refsForUncovered(uncovered: UncoveredRange[]): SectionRef[] {
  const refs: SectionRef[] = [];
  const wholeHunks = new Map<string, Set<number>>();
  for (const u of uncovered) {
    if (u.wholeHunk) {
      const set = wholeHunks.get(u.path) ?? new Set<number>();
      set.add(u.hunk);
      wholeHunks.set(u.path, set);
    }
  }
  const emitted = new Set<string>();
  for (const u of uncovered) {
    if (u.wholeHunk) {
      if (emitted.has(u.path)) continue;
      emitted.add(u.path);
      refs.push({ path: u.path, hunks: [...(wholeHunks.get(u.path) ?? [])].sort((a, b) => a - b) });
    } else {
      refs.push({ path: u.path, lines: { start: u.start, end: u.end, side: u.side } });
    }
  }
  return refs;
}
