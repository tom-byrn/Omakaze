import type { DiffHunk, DiffLine, ParsedFile } from "@/lib/diff/types";
import { plural, shortSha } from "@/lib/format";
import { escapeCurrencyDollars } from "@/lib/markdown/dollars";
import { computeCoverage, refSelectsLine, type SectionRef, type UncoveredRange } from "./refs";
import { missingRequired, type ResolvedTemplate } from "./templates";

/*
 * Markdown export of a guide: one document with the metadata, the summary, and each section's
 * explanation followed by the part of the diff it covers. Pure, so the viewer's download, the
 * REST API and the tests share it; loading the data is in export-data.ts.
 */

export type ExportSection = { title: string; body: string; refs: SectionRef[]; generated: boolean };

export type ExportInput = {
  guide: {
    title: string;
    version: number;
    status: string;
    summary: string;
    headSha: string;
    author: string | null;
    createdVia: string;
    createdAt: Date;
    template: ResolvedTemplate | null;
  };
  repo: { fullName: string; htmlUrl: string };
  pull: {
    number: number;
    title: string;
    htmlUrl: string;
    authorLogin: string | null;
    headRef: string | null;
    baseRef: string | null;
    /** The pull request's current head, to say when the guide is outdated. */
    headSha: string | null;
  };
  snapshot: { mergeBaseSha: string; truncated: boolean };
  files: ParsedFile[];
  sections: ExportSection[];
  /** The guide in Omakaze. Relative URLs in the markdown resolve against it, as they do in the viewer. */
  guideUrl: string;
  /** APP_URL; uploads are served under it. */
  appUrl: string;
  /** data: URIs of uploaded images by asset ID, to embed them instead of linking. */
  embeds?: Map<string, string>;
  exportedAt: Date;
};

/** The viewer's labels for `guides.created_via`. */
export const VIA_LABEL: Record<string, string> = {
  mcp: "MCP",
  api: "API",
  ui: "Omakaze",
  webhook: "automation",
  poll: "automation",
};

const STATUS_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
  copied: "Copied",
  changed: "Changed",
  unchanged: "Unchanged",
};

export function fileStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/** `acme-storefront-pr128-v2.md` */
export function exportFilename(repoFullName: string, prNumber: number, version: number, ext = "md"): string {
  const repo = repoFullName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${repo}-pr${prNumber}-v${version}.${ext}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function n(value: number): string {
  return value.toLocaleString("en");
}

/** Escape text that is shown as plain text in the viewer (titles), keeping backticks as code. */
export function escapeInline(text: string): string {
  return text.replace(/[\\*_[\]<>]/g, (c) => `\\${c}`).replace(/^#/, "\\#");
}

/** The anchor GitHub gives a heading (lower case, punctuation removed, spaces to hyphens). */
export function headingSlug(text: string, seen?: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
  if (!seen) return base;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/* ------------------------------------------------------------------ */
/* Markdown text: code-aware scanning                                  */
/* ------------------------------------------------------------------ */

type Block = { text: string; code: boolean };

/** Split markdown into code blocks (fenced code and `$$` math), which stay as they are, and other text. */
function splitBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let text: string[] = [];
  let code: string[] = [];
  let fence: string | null = null;
  let math = false;
  const flushText = () => {
    if (text.length > 0) blocks.push({ text: text.join("\n"), code: false });
    text = [];
  };
  const flushCode = () => {
    blocks.push({ text: code.join("\n"), code: true });
    code = [];
  };
  for (const line of markdown.split("\n")) {
    if (fence) {
      code.push(line);
      const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) {
        fence = null;
        flushCode();
      }
      continue;
    }
    if (math) {
      code.push(line);
      if (line.trim() === "$$") {
        math = false;
        flushCode();
      }
      continue;
    }
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open || line.trim() === "$$") {
      flushText();
      code.push(line);
      if (open) fence = open;
      else math = true;
      continue;
    }
    text.push(line);
  }
  flushText();
  if (code.length > 0) flushCode();
  return blocks;
}

/**
 * Replace code spans, inline `$$…$$` math and backslash escapes with placeholder characters of the
 * same length, so URLs and brackets are only found in prose and positions still line up.
 */
function maskCode(text: string): string {
  const chars = text.split("");
  const mask = (from: number, to: number) => {
    for (let p = from; p < to; p++) if (chars[p] !== "\n") chars[p] = "x";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length && text[i + 1] !== "\n") {
      mask(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "`") {
      let j = i;
      while (text[j] === "`") j++;
      const run = j - i;
      let k = j;
      let close = -1;
      while (k < text.length) {
        if (text[k] !== "`") {
          k++;
          continue;
        }
        let e = k;
        while (text[e] === "`") e++;
        if (e - k === run) {
          close = k;
          break;
        }
        k = e;
      }
      if (close === -1) {
        i = j;
        continue;
      }
      mask(i, close + run);
      i = close + run;
      continue;
    }
    if (c === "$" && text[i + 1] === "$") {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        mask(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    i++;
  }
  return chars.join("");
}

/** Index of the `[` that the `]` at `close` ends, or -1. */
function openingBracket(masked: string, close: number): number {
  let depth = 0;
  for (let j = close - 1; j >= 0; j--) {
    const c = masked[j];
    if (c === "]") depth++;
    else if (c === "[") {
      if (depth === 0) return j;
      depth--;
    }
  }
  return -1;
}

export type UrlKind = "image" | "link" | "media";
type Edit = { start: number; end: number; value: string };

const INLINE_DEST = /\]\([ \t]*(<[^>\n]*>|[^\s()<>]+(?:\([^\s()<>]*\)[^\s()<>]*)*)/g;
const REF_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm;
const HTML_TAG = /<(img|video|audio|source|a)\b[^>]*>/gi;
const HTML_URL_ATTR = /\b(src|href|poster)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/gi;

function rewriteText(text: string, fn: (url: string, kind: UrlKind) => string): string {
  const masked = maskCode(text);
  const edits: Edit[] = [];
  const add = (start: number, raw: string, kind: UrlKind) => {
    const angle = raw.startsWith("<") && raw.endsWith(">");
    const quoted = /^["']/.test(raw);
    const inner = angle || quoted ? raw.slice(1, -1) : raw;
    const offset = angle || quoted ? 1 : 0;
    const url = text.slice(start + offset, start + offset + inner.length);
    const next = fn(url, kind);
    if (next !== url) edits.push({ start: start + offset, end: start + offset + inner.length, value: next });
  };

  for (const m of masked.matchAll(INLINE_DEST)) {
    const raw = m[1];
    const start = m.index + m[0].length - raw.length;
    const open = openingBracket(masked, m.index);
    if (open === -1) continue;
    add(start, raw, open > 0 && masked[open - 1] === "!" ? "image" : "link");
  }
  for (const m of masked.matchAll(REF_DEFINITION)) {
    add(m.index + m[0].length - m[1].length, m[1], "link");
  }
  for (const tag of masked.matchAll(HTML_TAG)) {
    const name = tag[1].toLowerCase();
    for (const attr of tag[0].matchAll(HTML_URL_ATTR)) {
      const start = tag.index + attr.index + attr[1].length + attr[2].length;
      const kind: UrlKind = name === "a" ? "link" : name === "img" && attr[1].toLowerCase() === "src" ? "image" : "media";
      add(start, attr[3], kind);
    }
  }

  edits.sort((a, b) => b.start - a.start);
  let out = text;
  let limit = Infinity;
  for (const e of edits) {
    if (e.end > limit) continue;
    out = out.slice(0, e.start) + e.value + out.slice(e.end);
    limit = e.start;
  }
  return out;
}

/**
 * Rewrite the URLs of links, images, reference definitions and HTML media in markdown. Fenced code,
 * code spans and math are left as they are.
 */
export function rewriteUrls(markdown: string, fn: (url: string, kind: UrlKind) => string): string {
  return splitBlocks(markdown)
    .map((b) => (b.code ? b.text : rewriteText(b.text, fn)))
    .join("\n");
}

/** Shift ATX headings so the highest one has at least level `minLevel` (they sit under the export's own headings). */
export function shiftHeadings(markdown: string, minLevel: number): string {
  const blocks = splitBlocks(markdown);
  const HEADING = /^( {0,3})(#{1,6})(?=[ \t]|$)/;
  let min = 7;
  for (const b of blocks) {
    if (b.code) continue;
    for (const line of b.text.split("\n")) {
      const m = HEADING.exec(line);
      if (m) min = Math.min(min, m[2].length);
    }
  }
  const shift = min === 7 ? 0 : Math.max(0, minLevel - min);
  if (shift === 0) return markdown;
  return blocks
    .map((b) =>
      b.code
        ? b.text
        : b.text
            .split("\n")
            .map((line) => line.replace(HEADING, (_, space: string, hashes: string) => `${space}${"#".repeat(Math.min(6, hashes.length + shift))}`))
            .join("\n"),
    )
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* URLs                                                                */
/* ------------------------------------------------------------------ */

type UrlContext = Pick<ExportInput, "guideUrl" | "appUrl" | "embeds" | "repo" | "files"> & {
  headSha: string;
  mergeBaseSha: string;
};

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** GitHub's page for a file at the guide's head commit (or at the merge base for the old side). */
export function blobUrl(ctx: Pick<UrlContext, "repo" | "headSha" | "mergeBaseSha">, file: Pick<ParsedFile, "path" | "previousPath" | "status">, old = false): string {
  const base = old || file.status === "removed";
  const path = base ? (file.previousPath ?? file.path) : file.path;
  return `${ctx.repo.htmlUrl}/blob/${base ? ctx.mergeBaseSha : ctx.headSha}/${encodePath(path)}`;
}

/** `diff:path#L10-L20` (or `#old:L5`) as a link to the lines on GitHub. */
function diffLinkUrl(href: string, ctx: UrlContext): string {
  let raw: string;
  try {
    raw = decodeURIComponent(href.slice("diff:".length));
  } catch {
    raw = href.slice("diff:".length);
  }
  const [path, frag = ""] = raw.split("#");
  if (!path) return href;
  const m = /^(old:)?L?(\d+)(?:-L?(\d+))?$/.exec(frag);
  const file = ctx.files.find((f) => f.path === path) ?? { path, previousPath: null, status: "modified" };
  let anchor = "";
  if (m) {
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    anchor = a === b ? `#L${a}` : `#L${Math.min(a, b)}-L${Math.max(a, b)}`;
  }
  return `${blobUrl(ctx, file, Boolean(m?.[1]))}${anchor}`;
}

/** The ID of an upload served by this instance (`<APP_URL>/api/assets/<id>/<name>`), or null. */
export function assetIdOf(url: string, appUrl: string): string | null {
  const prefix = `${appUrl.replace(/\/+$/, "")}/api/assets/`;
  if (!url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length).split("/")[0];
  return /^[\w-]+$/.test(id) ? id : null;
}

/** Make a URL from the guide work outside Omakaze: absolute, `diff:` links to GitHub, embedded images. */
function exportUrl(url: string, kind: UrlKind, ctx: UrlContext): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("#")) return url;
  if (/^diff:/i.test(trimmed)) return diffLinkUrl(trimmed, ctx);
  let absolute = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      absolute = new URL(trimmed, ctx.guideUrl).toString();
    } catch {
      return url;
    }
  }
  if (kind === "image" && ctx.embeds) {
    const id = assetIdOf(absolute, ctx.appUrl);
    const data = id ? ctx.embeds.get(id) : undefined;
    if (data) return data;
  }
  return absolute;
}

/** IDs of this instance's uploads that markdown shows as images (the candidates for embedding). */
export function imageAssetIds(markdown: string, ctx: { guideUrl: string; appUrl: string }): string[] {
  const ids = new Set<string>();
  rewriteUrls(markdown, (url, kind) => {
    if (kind !== "image") return url;
    try {
      const id = assetIdOf(new URL(url.trim(), ctx.guideUrl).toString(), ctx.appUrl);
      if (id) ids.add(id);
    } catch {
      // not a URL
    }
    return url;
  });
  return [...ids];
}

/* ------------------------------------------------------------------ */
/* Diff excerpts                                                       */
/* ------------------------------------------------------------------ */

export type DiffRun = { header: string; lines: DiffLine[] };

export type DiffExcerpt = {
  runs: DiffRun[];
  additions: number;
  deletions: number;
  /** Line ranges of refs that select no line of the diff (unchanged code outside the hunks). */
  outside: { start: number; end: number; side: "new" | "old" }[];
  notes: string[];
};

/** Unchanged lines shown around a line range, as in the viewer. */
const MARGIN = 3;

function lastNumber(lines: DiffLine[], side: "oldNumber" | "newNumber"): number | null {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i][side] !== null) return lines[i][side];
  return null;
}

/** A `@@ -a,b +c,d @@` header for lines `start…` of a hunk. An empty side names the line before it, as git does. */
function runHeader(hunk: DiffHunk, start: number, lines: DiffLine[]): string {
  const before = hunk.lines.slice(0, start);
  const oldCount = lines.filter((l) => l.type !== "add").length;
  const newCount = lines.filter((l) => l.type !== "del").length;
  const oldStart =
    oldCount > 0
      ? lines.find((l) => l.oldNumber !== null)!.oldNumber!
      : (lastNumber(before, "oldNumber") ?? (hunk.oldLines > 0 ? hunk.oldStart - 1 : hunk.oldStart));
  const newStart =
    newCount > 0
      ? lines.find((l) => l.newNumber !== null)!.newNumber!
      : (lastNumber(before, "newNumber") ?? (hunk.newLines > 0 ? hunk.newStart - 1 : hunk.newStart));
  const range = (s: number, c: number) => (c === 1 ? `${s}` : `${s},${c}`);
  return `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@${hunk.heading ? ` ${hunk.heading}` : ""}`;
}

/** The lines of a file's diff that a section's refs select: whole files, hunks or line ranges. */
export function diffExcerpt(file: ParsedFile, refs: SectionRef[]): DiffExcerpt {
  const own = refs.filter((r) => r.path === file.path);
  const hit = new Set<SectionRef>();
  const runs: DiffRun[] = [];
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    const count = hunk.lines.length;
    const picked = new Uint8Array(count);
    hunk.lines.forEach((_, i) => {
      for (const r of own) {
        if (refSelectsLine(r, file, hunk, i)) {
          picked[i] = 1;
          hit.add(r);
        }
      }
    });
    const shown = picked.slice();
    for (let i = 0; i < count; i++) {
      if (!picked[i]) continue;
      if (i === 0 || !picked[i - 1]) for (let k = 1; k <= MARGIN && i - k >= 0 && hunk.lines[i - k].type === "context"; k++) shown[i - k] = 1;
      if (i === count - 1 || !picked[i + 1]) for (let k = 1; k <= MARGIN && i + k < count && hunk.lines[i + k].type === "context"; k++) shown[i + k] = 1;
    }
    let i = 0;
    while (i < count) {
      if (!shown[i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < count && shown[i]) i++;
      const lines = hunk.lines.slice(start, i);
      runs.push({ header: runHeader(hunk, start, lines), lines });
      for (const l of lines) {
        if (l.type === "add") additions++;
        else if (l.type === "del") deletions++;
      }
    }
  }
  const outside = own
    .filter((r) => r.lines && !hit.has(r))
    .map((r) => ({ start: r.lines!.start, end: r.lines!.end, side: r.lines!.side ?? ("new" as const) }));
  return { runs, additions, deletions, outside, notes: own.filter((r) => r.note).map((r) => r.note!) };
}

/** The excerpt as a unified diff with `---`/`+++` file headers. */
export function excerptPatch(file: Pick<ParsedFile, "path" | "previousPath" | "status">, excerpt: Pick<DiffExcerpt, "runs">): string {
  const out = [
    `--- ${file.status === "added" ? "/dev/null" : `a/${file.previousPath ?? file.path}`}`,
    `+++ ${file.status === "removed" ? "/dev/null" : `b/${file.path}`}`,
  ];
  for (const run of excerpt.runs) {
    out.push(run.header);
    for (const l of run.lines) {
      out.push(`${l.type === "add" ? "+" : l.type === "del" ? "-" : " "}${l.content}`);
      if (l.noNewline) out.push("\\ No newline at end of file");
    }
  }
  return out.join("\n");
}

/** A code fence longer than any backtick run in the content. */
function fenced(content: string, lang: string): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${content}\n${fence}`;
}

/** Files a section shows, in the order its refs name them. */
export function sectionFiles(refs: SectionRef[], files: ParsedFile[]): ParsedFile[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out: ParsedFile[] = [];
  for (const r of refs) {
    const f = byPath.get(r.path);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export type CoverageSummary = {
  totalChanged: number;
  /** Changed lines in any section, including the automatic "Other changes" */
  covered: number;
  /** Changed lines that only the automatic section covers */
  automatic: number;
  uncovered: UncoveredRange[];
  truncated: boolean;
};

export function coverageSummary(files: ParsedFile[], sections: Pick<ExportSection, "refs" | "generated">[], truncated: boolean): CoverageSummary {
  const all = computeCoverage(files, sections);
  const written = computeCoverage(files, sections.filter((s) => !s.generated));
  return {
    totalChanged: all.totalChanged,
    covered: all.coveredChanged,
    automatic: all.coveredChanged - written.coveredChanged,
    uncovered: all.uncovered,
    truncated,
  };
}

export function coveragePercent(c: Pick<CoverageSummary, "totalChanged" | "covered">): number {
  return c.totalChanged === 0 ? 100 : Math.round((c.covered / c.totalChanged) * 100);
}

/** The coverage note: how many changed lines the sections cover, and what no section covers. */
export function coverageSentences(c: CoverageSummary): string[] {
  const out: string[] = [];
  const auto = c.automatic > 0 ? `${n(c.automatic)} of them only in the automatic "Other changes" section` : "";
  if (c.totalChanged === 0) out.push("The pull request changes no lines.");
  else if (c.covered === c.totalChanged) out.push(`Sections cover all ${plural(c.totalChanged, "changed line")}${auto ? `, ${auto}` : ""}.`);
  else {
    out.push(`Sections cover ${n(c.covered)} of ${plural(c.totalChanged, "changed line")} (${coveragePercent(c)}%)${auto ? `, ${auto}` : ""}.`);
    out.push(`${plural(c.totalChanged - c.covered, "changed line")} ${c.totalChanged - c.covered === 1 ? "is" : "are"} in no section.`);
  }
  if (c.truncated) out.push("GitHub listed more changed files than it returned; the guide covers the files it returned.");
  return out;
}

export function describeRange(u: Pick<UncoveredRange, "start" | "end" | "side">): string {
  const lines = u.start === u.end ? `line ${u.start}` : `lines ${u.start}–${u.end}`;
  return u.side === "old" ? `${lines} (old)` : lines;
}

/* ------------------------------------------------------------------ */
/* The document                                                        */
/* ------------------------------------------------------------------ */

function sectionHeading(index: number, title: string): string {
  return `${index + 1}. ${title}`;
}

/** The guide as one Markdown document. */
export function guideMarkdown(input: ExportInput): string {
  const { guide, repo, pull, files, sections } = input;
  const ctx: UrlContext = { ...input, headSha: guide.headSha, mergeBaseSha: input.snapshot.mergeBaseSha };
  // Dollar signs that the viewer shows as text are escaped, so renderers with math don't read prices as formulas.
  const prose = (markdown: string) => shiftHeadings(escapeCurrencyDollars(rewriteUrls(markdown, (url, kind) => exportUrl(url, kind, ctx))), 3).trim();
  const coverage = coverageSummary(files, sections, input.snapshot.truncated);
  const additions = files.reduce((s, f) => s + f.additions, 0);
  const deletions = files.reduce((s, f) => s + f.deletions, 0);
  const prRef = `${repo.fullName}#${pull.number}`;
  const commitUrl = (sha: string) => `${repo.htmlUrl}/commit/${sha}`;
  const out: string[] = [];

  out.push(`# ${escapeInline(guide.title)}`);
  out.push(`A guided walkthrough of [${prRef}](${pull.htmlUrl}), exported from Omakaze.`);

  const meta: string[] = [];
  meta.push(`- **Pull request:** [${prRef}](${pull.htmlUrl}) ${escapeInline(pull.title)}`);
  if (pull.authorLogin) meta.push(`- **Author:** ${escapeInline(pull.authorLogin)}`);
  if (pull.headRef && pull.baseRef) meta.push(`- **Branches:** \`${pull.headRef}\` → \`${pull.baseRef}\``);
  meta.push(`- **Head commit:** [\`${shortSha(guide.headSha)}\`](${commitUrl(guide.headSha)})`);
  const writer = [guide.author ? `by ${escapeInline(guide.author)}` : "", `via ${VIA_LABEL[guide.createdVia] ?? guide.createdVia}`].filter(Boolean).join(" ");
  meta.push(`- **Guide:** version ${guide.version}, ${guide.status}, written ${writer} on ${isoDate(guide.createdAt)}`);
  if (guide.template?.sections.length) {
    const missing = missingRequired(guide.template, sections);
    meta.push(
      `- **Template:** ${escapeInline(guide.template.name ?? "Outline")} (${guide.template.source})${missing.length ? `; missing required: ${missing.map((s) => escapeInline(s.title)).join(", ")}` : ""}`,
    );
  }
  meta.push(`- **Changes:** ${plural(files.length, "file")}, +${n(additions)} −${n(deletions)}`);
  meta.push(`- **Coverage:** ${coveragePercent(coverage)}% of changed lines are in a section`);
  meta.push(`- **In Omakaze:** ${input.guideUrl}`);
  out.push(meta.join("\n"));

  if (pull.headSha && pull.headSha !== guide.headSha) {
    out.push(`> This guide covers [\`${shortSha(guide.headSha)}\`](${commitUrl(guide.headSha)}). The pull request now points to [\`${shortSha(pull.headSha)}\`](${commitUrl(pull.headSha)}).`);
  }

  const seen = new Map<string, number>();
  const summary = guide.summary.trim() ? prose(guide.summary) : "";
  headingSlug("Contents", seen);
  const contents: string[] = [];
  if (summary) contents.push(`- [Overview](#${headingSlug("Overview", seen)})`);
  sections.forEach((s, i) => contents.push(`- [${escapeInline(sectionHeading(i, s.title))}](#${headingSlug(sectionHeading(i, s.title), seen)})`));
  contents.push(`- [Coverage](#${headingSlug("Coverage", seen)})`);
  out.push(`## Contents\n\n${contents.join("\n")}`);

  if (summary) out.push(`## Overview\n\n${summary}`);

  sections.forEach((s, i) => {
    const shown = sectionFiles(s.refs, files).map((f) => ({ file: f, excerpt: diffExcerpt(f, s.refs) }));
    const plus = shown.reduce((t, x) => t + x.excerpt.additions, 0);
    const minus = shown.reduce((t, x) => t + x.excerpt.deletions, 0);
    out.push(`## ${escapeInline(sectionHeading(i, s.title))}`);
    out.push(`${plural(shown.length, "file")} · +${n(plus)} −${n(minus)}${s.generated ? " · Added automatically: changes that no other section covers." : ""}`);
    const body = s.body.trim() ? prose(s.body) : "";
    if (body) out.push(body);
    if (shown.length === 0) return;
    out.push("### Diff");
    for (const { file, excerpt } of shown) {
      out.push(`#### \`${file.path}\``);
      const facts = [fileStatusLabel(file.status)];
      if (file.previousPath && file.previousPath !== file.path) facts.push(`from \`${file.previousPath}\``);
      facts.push(`+${n(excerpt.additions)} −${n(excerpt.deletions)}`);
      out.push(`${facts.join(" · ")} · [View on GitHub](${blobUrl(ctx, file)})`);
      for (const note of excerpt.notes) out.push(`_${escapeInline(note)}_`);
      if (file.patch === null) out.push("Binary file or diff too large to include.");
      else if (file.hunks.length === 0) out.push(file.status === "renamed" ? "Renamed without changes." : "No changes.");
      else if (excerpt.runs.length > 0) out.push(fenced(excerptPatch(file, excerpt), "diff"));
      else if (excerpt.outside.length === 0) out.push("Lines from this file belong to other sections.");
      for (const o of excerpt.outside) {
        const range = describeRange(o);
        out.push(`${range[0].toUpperCase()}${range.slice(1)} ${o.start === o.end ? "is" : "are"} unchanged and not part of the diff.`);
      }
    }
  });

  const coverageLines = coverageSentences(coverage);
  const gaps = coverage.uncovered.map((u) => `- \`${u.path}\` ${describeRange(u)} (${plural(u.changedLines, "line")})`);
  out.push(`## Coverage\n\n${coverageLines.join(" ")}${gaps.length ? `\n\n${gaps.join("\n")}` : ""}`);

  out.push(`---\n\nExported from Omakaze on ${isoDate(input.exportedAt)}. Diffs are from the guide's snapshot of the pull request at [\`${shortSha(guide.headSha)}\`](${commitUrl(guide.headSha)}).`);
  return `${out.join("\n\n")}\n`;
}
