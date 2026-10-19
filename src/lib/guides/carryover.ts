/**
 * Comparing a guide's sections across versions: which section of an older version a section
 * corresponds to, whether the code it covers changed, and an interdiff when it did.
 *
 * Every version has its own diff snapshot, and only the snapshots' patches are available, so the
 * "code a section covers" is the list of changed lines (added and deleted) that its refs select.
 * Two sections cover the same code when those lines are identical per file, ignoring line numbers,
 * which shift when other parts of a file change. Context lines are ignored: they are not part of the
 * change, and a rebase can change them without changing what was reviewed.
 *
 * Pure functions only; the database side is in progress.ts.
 */
import type { ParsedFile } from "@/lib/diff/types";
import { refSelectsLine, type SectionRef } from "./refs";

/** The parts of a section the comparison needs. */
export type ComparableSection = { id: string; title: string; refs: SectionRef[]; generated: boolean };

/** A changed line a section covers. `line` is the new-side number of an added line, the old-side number of a deleted one. */
export type CodeLine = { type: "add" | "del"; content: string; line: number };

/** What a section covers in one file. */
export type FileCode = {
  path: string;
  lines: CodeLine[];
  /**
   * Stand-in for files without a patch (binary, too large, or renamed without changes): status,
   * previous path and blob sha. null when nothing identifies the content, so it never counts as unchanged.
   */
  opaque?: string | null;
};

export type SectionCode = Map<string, FileCode>;

export type VersionSide = { files: ParsedFile[]; sections: ComparableSection[] };

/** Lines a section's refs select, per file, in diff order. */
export function sectionCode(refs: SectionRef[], files: ParsedFile[]): SectionCode {
  const out: SectionCode = new Map();
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const path of new Set(refs.map((r) => r.path))) {
    const file = byPath.get(path);
    if (!file) continue;
    const fileRefs = refs.filter((r) => r.path === path);
    if (file.hunks.length === 0) {
      out.set(path, { path, lines: [], opaque: file.sha ? `${file.status}:${file.previousPath ?? ""}:${file.sha}` : null });
      continue;
    }
    const lines: CodeLine[] = [];
    for (const h of file.hunks) {
      h.lines.forEach((l, i) => {
        if (l.type === "context") return;
        if (!fileRefs.some((r) => refSelectsLine(r, file, h, i))) return;
        lines.push(l.type === "add" ? { type: "add", content: l.content, line: l.newNumber! } : { type: "del", content: l.content, line: l.oldNumber! });
      });
    }
    out.set(path, { path, lines });
  }
  return out;
}

const lineKey = (l: CodeLine) => `${l.type}\u0000${l.content}`;

function sameFile(a: FileCode, b: FileCode): boolean {
  if (a.opaque !== undefined || b.opaque !== undefined) return a.opaque !== undefined && a.opaque !== null && a.opaque === b.opaque;
  if (a.lines.length !== b.lines.length) return false;
  return a.lines.every((l, i) => l.type === b.lines[i].type && l.content === b.lines[i].content);
}

/** Whether two sections cover exactly the same changed lines. */
export function sameCode(a: SectionCode, b: SectionCode): boolean {
  // A file whose selection is empty doesn't count, so a ref that selects nothing is not a difference.
  const paths = (c: SectionCode) => [...c.values()].filter((f) => f.lines.length > 0 || f.opaque !== undefined).map((f) => f.path);
  const pa = paths(a);
  const pb = new Set(paths(b));
  if (pa.length !== pb.size || pa.some((p) => !pb.has(p))) return false;
  return pa.every((p) => sameFile(a.get(p)!, b.get(p)!));
}

function isEmpty(code: SectionCode): boolean {
  return [...code.values()].every((f) => f.lines.length === 0 && f.opaque === undefined);
}

/* ------------------------------------------------------------------ */
/* Matching sections across versions                                   */
/* ------------------------------------------------------------------ */

/** Minimum similarity for two sections to be treated as the same section. */
export const MATCH_THRESHOLD = 0.35;

function normalizeTitle(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function titleSimilarity(a: string, b: string): number {
  const ta = normalizeTitle(a);
  const tb = normalizeTitle(b);
  if (ta.length === 0 && tb.length === 0) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / (sa.size + sb.size - inter);
}

function multiset(code: SectionCode): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of code.values()) {
    for (const l of f.lines) {
      // Blank lines and lone brackets appear everywhere and say nothing about which section this is.
      if (l.content.trim().length < 2) continue;
      const k = `${f.path}\u0000${lineKey(l)}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    if (f.opaque) m.set(`${f.path}\u0000${f.opaque}`, 1);
  }
  return m;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
  let sa = 0;
  let sb = 0;
  let inter = 0;
  for (const v of a.values()) sa += v;
  for (const [k, v] of b) {
    sb += v;
    inter += Math.min(v, a.get(k) ?? 0);
  }
  return sa + sb === 0 ? 0 : (2 * inter) / (sa + sb);
}

function setDice(a: Set<string>, b: Set<string>): number {
  if (a.size + b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

type Prepared = { section: ComparableSection; index: number; code: SectionCode; lines: Map<string, number>; paths: Set<string>; empty: boolean };

function prepare(side: VersionSide): Prepared[] {
  return side.sections.map((section, index) => {
    const code = sectionCode(section.refs, side.files);
    return { section, index, code, lines: multiset(code), paths: new Set(section.refs.map((r) => r.path)), empty: isEmpty(code) };
  });
}

/**
 * How alike two sections are, from 0 to 1 (2 for identical code). The changed lines they share
 * weigh most, then the files they reference; the title is a weak hint. The automatic "Other
 * changes" sections only match each other.
 */
function similarity(a: Prepared, b: Prepared): number {
  if (a.section.generated !== b.section.generated) return 0;
  if (a.section.generated) return 1;
  if (a.empty || b.empty) {
    // Sections without code (text only) can only be told apart by their titles.
    return a.empty && b.empty && titleSimilarity(a.section.title, b.section.title) === 1 ? 1 : 0;
  }
  if (sameCode(a.code, b.code)) return 2;
  return 0.6 * dice(a.lines, b.lines) + 0.25 * setDice(a.paths, b.paths) + 0.15 * titleSimilarity(a.section.title, b.section.title);
}

export type SectionMatch =
  | { status: "new" }
  | { status: "unchanged"; previousId: string }
  | { status: "changed"; previousId: string; previous: SectionCode; current: SectionCode };

/**
 * Pair each section of `next` with at most one section of `prev` (greedy, best similarity first,
 * then closest position) and say whether the code it covers changed. Keyed by `next` section id.
 */
export function matchSections(prev: VersionSide, next: VersionSide): Map<string, SectionMatch> {
  const a = prepare(prev);
  const b = prepare(next);
  const pairs: { i: number; j: number; score: number }[] = [];
  for (const x of a) {
    for (const y of b) {
      const score = similarity(x, y);
      if (score >= MATCH_THRESHOLD) pairs.push({ i: x.index, j: y.index, score: score - 0.001 * Math.abs(x.index - y.index) });
    }
  }
  pairs.sort((p, q) => q.score - p.score);
  const usedA = new Set<number>();
  const out = new Map<string, SectionMatch>();
  for (const p of pairs) {
    const y = b[p.j];
    if (usedA.has(p.i) || out.has(y.section.id)) continue;
    usedA.add(p.i);
    const x = a[p.i];
    out.set(
      y.section.id,
      sameCode(x.code, y.code) ? { status: "unchanged", previousId: x.section.id } : { status: "changed", previousId: x.section.id, previous: x.code, current: y.code },
    );
  }
  for (const y of b) if (!out.has(y.section.id)) out.set(y.section.id, { status: "new" });
  return out;
}

/* ------------------------------------------------------------------ */
/* Interdiff                                                           */
/* ------------------------------------------------------------------ */

/** A covered line in the interdiff: in both versions, only the older one, or only the newer one. */
export type InterdiffRow = { op: "same" | "removed" | "added"; type: "add" | "del"; content: string; line: number };

/** Rows around a run of differences; `skipped` unchanged rows come before it. */
export type InterdiffChunk = { skipped: number; rows: InterdiffRow[] };

export type FileInterdiff = {
  path: string;
  /** "added": the section did not cover this file before; "removed": it no longer does; "changed": it covers both. */
  status: "added" | "removed" | "changed";
  /** Rows only in the newer version, and only in the older one. */
  added: number;
  removed: number;
  chunks: InterdiffChunk[];
  /** Unchanged rows after the last chunk. */
  trailing: number;
  /** Rows were left out to keep the interdiff small. */
  truncated: boolean;
  /** The file has no patch in at least one version (binary or too large), so only "it changed" is known. */
  opaque: boolean;
  /** Lines of the newer snapshot that are new: added lines by new-side number, deleted lines by old-side number. */
  marks: { add: number[]; del: number[] };
};

const CONTEXT = 2;
const MAX_ROWS = 400;
/** Above this many cells the alignment falls back to matching lines by content alone. */
const MAX_CELLS = 4_000_000;

/** Align two line lists: longest common subsequence after trimming the common ends. */
function align(a: CodeLine[], b: CodeLine[]): InterdiffRow[] {
  const ka = a.map(lineKey);
  const kb = b.map(lineKey);
  let start = 0;
  while (start < a.length && start < b.length && ka[start] === kb[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA--;
    endB--;
  }
  const rows: InterdiffRow[] = [];
  const same = (l: CodeLine): InterdiffRow => ({ op: "same", ...l });
  for (let i = 0; i < start; i++) rows.push(same(b[i]));
  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_CELLS) {
    // Too large for a full alignment: a line counts as unchanged when the other side has it too.
    const left = new Map<string, number>();
    for (let i = start; i < endA; i++) left.set(ka[i], (left.get(ka[i]) ?? 0) + 1);
    const right = new Map<string, number>();
    for (let j = start; j < endB; j++) right.set(kb[j], (right.get(kb[j]) ?? 0) + 1);
    for (let i = start; i < endA; i++) {
      const c = right.get(ka[i]) ?? 0;
      if (c > 0) right.set(ka[i], c - 1);
      else rows.push({ op: "removed", ...a[i] });
    }
    for (let j = start; j < endB; j++) {
      const c = left.get(kb[j]) ?? 0;
      if (c > 0) {
        left.set(kb[j], c - 1);
        rows.push(same(b[j]));
      } else rows.push({ op: "added", ...b[j] });
    }
  } else {
    // dp[i][j] = length of the LCS of a[start+i..] and b[start+j..].
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = ka[start + i] === kb[start + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ka[start + i] === kb[start + j]) {
        rows.push(same(b[start + j]));
        i++;
        j++;
      } else if (j >= m || (i < n && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) {
        rows.push({ op: "removed", ...a[start + i] });
        i++;
      } else {
        rows.push({ op: "added", ...b[start + j] });
        j++;
      }
    }
  }
  for (let j = endB; j < b.length; j++) rows.push(same(b[j]));
  return rows;
}

function chunk(rows: InterdiffRow[]): { chunks: InterdiffChunk[]; trailing: number; truncated: boolean } {
  const keep = new Uint8Array(rows.length);
  rows.forEach((r, i) => {
    if (r.op === "same") return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = 1;
  });
  const chunks: InterdiffChunk[] = [];
  let skipped = 0;
  let kept = 0;
  let current: InterdiffChunk | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) {
      skipped++;
      current = null;
      continue;
    }
    if (kept >= MAX_ROWS) return { chunks, trailing: 0, truncated: true };
    if (!current) {
      current = { skipped, rows: [] };
      chunks.push(current);
      skipped = 0;
    }
    current.rows.push(rows[i]);
    kept++;
  }
  return { chunks, trailing: skipped, truncated: false };
}

/** What changed between the code a section covered in an older version and what it covers now, per file. */
export function interdiff(previous: SectionCode, current: SectionCode): FileInterdiff[] {
  const out: FileInterdiff[] = [];
  const paths = [...current.keys(), ...[...previous.keys()].filter((p) => !current.has(p))];
  for (const path of paths) {
    const before = previous.get(path);
    const after = current.get(path);
    const hasBefore = Boolean(before && (before.lines.length > 0 || before.opaque !== undefined));
    const hasAfter = Boolean(after && (after.lines.length > 0 || after.opaque !== undefined));
    if (!hasBefore && !hasAfter) continue;
    if (before && after && hasBefore && hasAfter && sameFile(before, after)) continue;
    const status: FileInterdiff["status"] = !hasBefore ? "added" : !hasAfter ? "removed" : "changed";
    const opaque = before?.opaque !== undefined || after?.opaque !== undefined;
    const rows = opaque ? [] : align(hasBefore ? before!.lines : [], hasAfter ? after!.lines : []);
    const { chunks, trailing, truncated } = chunk(rows);
    const marks = { add: [] as number[], del: [] as number[] };
    for (const r of rows) if (r.op === "added") (r.type === "add" ? marks.add : marks.del).push(r.line);
    out.push({
      path,
      status,
      added: rows.filter((r) => r.op === "added").length,
      removed: rows.filter((r) => r.op === "removed").length,
      chunks,
      trailing,
      truncated,
      opaque,
      marks,
    });
  }
  return out;
}

/** How a section differs from the same section in an earlier version: new, or covering different code. */
export type SectionChange = { status: "new" | "changed"; version: number; files: FileInterdiff[] };

/* ------------------------------------------------------------------ */
/* Carrying review marks                                               */
/* ------------------------------------------------------------------ */

/** A member's mark on a section of an older version. */
export type ReviewMark = { sectionId: string; userId: string; reviewedAt: Date; carriedFromVersion: number | null };

export type CarriedMark = { sectionId: string; userId: string; reviewedAt: Date; carriedFromVersion: number };

/**
 * Marks to copy into a newer version: a mark on an older section carries to the section that
 * matches it when the code is unchanged. The new mark keeps the original review time and names the
 * version the member actually reviewed (so a mark carried twice still says v1). `existing` holds
 * `sectionId:userId` pairs that already have a mark in the newer version; they are skipped.
 */
export function marksToCarry(
  matches: Map<string, SectionMatch>,
  marks: ReviewMark[],
  previousVersion: number,
  existing: Set<string>,
): CarriedMark[] {
  const target = new Map<string, string>();
  for (const [id, m] of matches) if (m.status === "unchanged") target.set(m.previousId, id);
  const out: CarriedMark[] = [];
  for (const mark of marks) {
    const sectionId = target.get(mark.sectionId);
    if (!sectionId || existing.has(`${sectionId}:${mark.userId}`)) continue;
    existing.add(`${sectionId}:${mark.userId}`);
    out.push({ sectionId, userId: mark.userId, reviewedAt: mark.reviewedAt, carriedFromVersion: mark.carriedFromVersion ?? previousVersion });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Visits                                                              */
/* ------------------------------------------------------------------ */

/** Page views of a pull request less than this far apart are one visit. */
export const VISIT_GAP_MINUTES = 30;

/**
 * The time "new since your last visit" compares against, from the viewer's `guide_views` rows for
 * every version of the pull request. A new visit compares against the end of the previous one (its
 * last page view); a page view within the same visit keeps what the visit started with. null on
 * the first visit, when nothing is new to the viewer.
 */
export function visitSince(rows: { lastViewedAt: Date; previousVisitAt: Date | null }[], now: Date): Date | null {
  let latest: (typeof rows)[number] | null = null;
  for (const r of rows) if (!latest || r.lastViewedAt > latest.lastViewedAt) latest = r;
  if (!latest) return null;
  if (now.getTime() - latest.lastViewedAt.getTime() < VISIT_GAP_MINUTES * 60_000) return latest.previousVisitAt;
  return latest.lastViewedAt;
}
