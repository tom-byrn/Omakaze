import { parsePatch } from "@/lib/diff/parse";

/**
 * GitHub suggested changes. A review comment whose body contains a ```suggestion fenced block
 * proposes to replace the commented lines (head side) with the lines of the block; GitHub stores
 * it as an ordinary comment body. These helpers have no server dependencies, so the viewer and
 * the server (and MCP tools) share them.
 */

export type BodySegment = { type: "markdown"; text: string } | { type: "suggestion"; lines: string[] };

// CommonMark fences: up to three spaces of indentation, three or more backticks or tildes.
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function closes(line: string, fence: string): boolean {
  const m = FENCE_RE.exec(line);
  return Boolean(m && m[2][0] === fence[0] && m[2].length >= fence.length && m[3].trim() === "");
}

/**
 * Split a comment body into markdown text and suggestion blocks, in order. A ```suggestion line
 * inside another fenced code block is left alone. An unclosed suggestion runs to the end of the
 * body, as an unclosed fence does in markdown.
 */
export function parseSuggestions(body: string): BodySegment[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const out: BodySegment[] = [];
  let text: string[] = [];
  const flush = () => {
    const joined = text.join("\n");
    if (joined.trim()) out.push({ type: "markdown", text: joined });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_RE.exec(lines[i]);
    // Backtick fences can't have backticks in their info string.
    if (!m || (m[2][0] === "`" && m[3].includes("`"))) {
      text.push(lines[i]);
      continue;
    }
    const [, indent, fence, info] = m;
    let end = i + 1;
    while (end < lines.length && !closes(lines[end], fence)) end++;
    const content = lines.slice(i + 1, end);
    if (info.trim() === "suggestion") {
      flush();
      // Content lines lose up to as much indentation as the opening fence had.
      out.push({ type: "suggestion", lines: content.map((l) => l.replace(new RegExp(`^ {0,${indent.length}}`), "")) });
    } else {
      text.push(...lines.slice(i, Math.min(end + 1, lines.length)));
    }
    i = end;
  }
  flush();
  return out;
}

export function hasSuggestion(body: string): boolean {
  return parseSuggestions(body).some((s) => s.type === "suggestion");
}

/** A ```suggestion block for `lines`, with a longer fence when a line itself starts with ```. */
export function suggestionBlock(lines: string[]): string {
  let longest = 2;
  for (const l of lines) {
    const m = /^ {0,3}(`{3,})/.exec(l);
    if (m) longest = Math.max(longest, m[1].length);
  }
  const fence = "`".repeat(longest + 1);
  return [`${fence}suggestion`, ...lines, fence].join("\n");
}

/**
 * Insert a suggestion block for `lines` into a draft at the selection, on lines of its own.
 * Returns the new text and where to put the caret: the end of the last suggested line, so the
 * reviewer can start editing it.
 */
export function insertSuggestion(
  draft: string,
  selection: { start: number; end: number },
  lines: string[],
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, draft.length));
  const end = Math.max(start, Math.min(selection.end, draft.length));
  const before = draft.slice(0, start);
  const after = draft.slice(end);
  const block = suggestionBlock(lines);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after === "" ? "\n" : after.startsWith("\n") ? "" : "\n";
  const text = `${before}${lead}${block}${trail}${after}`;
  // Inside the block: before the closing fence and its newline.
  const closing = block.length - block.lastIndexOf("\n");
  const caret = before.length + lead.length + block.length - (lines.length > 0 ? closing : 0);
  return { text, caret };
}

/**
 * The text of the lines a review comment covers, read from GitHub's `diff_hunk` (the hunk up to
 * the commented line, at the commit the comment was written on). Pass the comment's
 * `original_line` and `original_start_line`, which refer to that commit. Returns null when the
 * hunk doesn't contain every line of the range.
 */
export function commentedLines(
  diffHunk: string | null | undefined,
  range: { side: "LEFT" | "RIGHT"; line: number | null; startLine?: number | null },
): string[] | null {
  if (!diffHunk || !range.line) return null;
  const start = range.startLine && range.startLine <= range.line ? range.startLine : range.line;
  const found = new Map<number, string>();
  for (const h of parsePatch(diffHunk)) {
    for (const l of h.lines) {
      const n = range.side === "LEFT" ? l.oldNumber : l.newNumber;
      if (n !== null && n >= start && n <= range.line) found.set(n, l.content);
    }
  }
  const out: string[] = [];
  for (let n = start; n <= range.line; n++) {
    const text = found.get(n);
    if (text === undefined) return null;
    out.push(text);
  }
  return out;
}

export type SuggestionRow = {
  kind: "del" | "add";
  text: string;
  /** Line number in the file; suggested lines are numbered from the first replaced line. */
  number: number | null;
  /** Changed characters [from, to) when the line pairs with one on the other side. */
  change: [number, number] | null;
};

/** Differing middle of two lines: [from, toA, toB], or null when they share no prefix or suffix. */
function inlineChange(a: string, b: string): [number, number, number] | null {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  if (p === 0 && s === 0) return null;
  return [p, a.length - s, b.length - s];
}

/**
 * Rows of the small diff shown for a suggestion, as GitHub shows it: the replaced lines, then the
 * suggested lines. When both sides have the same number of lines, each pair gets the changed
 * characters marked. `original` is null when the replaced lines are not known.
 */
export function suggestionRows(original: string[] | null, suggested: string[], startLine: number | null = null): SuggestionRow[] {
  const removed: SuggestionRow[] = (original ?? []).map((text, i) => ({
    kind: "del",
    text,
    number: startLine === null ? null : startLine + i,
    change: null,
  }));
  const added: SuggestionRow[] = suggested.map((text, i) => ({
    kind: "add",
    text,
    number: startLine === null ? null : startLine + i,
    change: null,
  }));
  if (original && original.length === suggested.length) {
    original.forEach((a, i) => {
      const b = suggested[i];
      if (a === b) return;
      const c = inlineChange(a, b);
      if (!c) return;
      removed[i].change = [c[0], c[1]];
      added[i].change = [c[0], c[2]];
    });
  }
  return [...removed, ...added];
}

/** Whether a suggestion would leave the lines as they are. */
export function isNoopSuggestion(original: string[] | null, suggested: string[]): boolean {
  return original !== null && original.length === suggested.length && original.every((l, i) => l === suggested[i]);
}

/** Comment text without suggestion blocks, for one-line previews. */
export function bodyWithoutSuggestions(body: string): string {
  return parseSuggestions(body)
    .filter((s): s is Extract<BodySegment, { type: "markdown" }> => s.type === "markdown")
    .map((s) => s.text.trim())
    .join("\n\n");
}
