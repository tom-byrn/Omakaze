import type { DiffHunk, ParsedFile } from "./types";

/** Plain-text rendering of diffs for LLMs: new-side line numbers, o-prefixed old-side numbers for removals. */
export function renderHunkText(hunk: DiffHunk, filter?: (lineIndex: number) => boolean): string {
  const out: string[] = [`#${hunk.index} ${hunk.header}`];
  hunk.lines.forEach((l, i) => {
    if (filter && !filter(i)) return;
    if (l.type === "add") out.push(`+${String(l.newNumber).padStart(5)} | ${l.content}`);
    else if (l.type === "del") out.push(`-${`o${l.oldNumber}`.padStart(5)} | ${l.content}`);
    else out.push(` ${String(l.newNumber).padStart(5)} | ${l.content}`);
  });
  return out.join("\n");
}

export function fileHeaderText(f: ParsedFile): string {
  const rename = f.previousPath && f.previousPath !== f.path ? ` (renamed from ${f.previousPath})` : "";
  return `### ${f.path}${rename} [${f.status}, +${f.additions} -${f.deletions}, ${f.hunks.length} hunk${f.hunks.length === 1 ? "" : "s"}]`;
}

export function renderFileText(f: ParsedFile, maxChars: number): string {
  if (f.patch === null) return `${fileHeaderText(f)}\n(binary or too large to show)`;
  const parts = [fileHeaderText(f)];
  let used = parts[0].length;
  for (const h of f.hunks) {
    const text = renderHunkText(h);
    if (used + text.length > maxChars) {
      const lines = text.split("\n");
      const keep = Math.max(20, Math.floor((maxChars - used) / 80));
      parts.push([...lines.slice(0, keep), `… ${lines.length - keep} more lines in hunk #${h.index} not shown …`].join("\n"));
      const rest = f.hunks.filter((x) => x.index > h.index);
      if (rest.length > 0) parts.push(`(hunks ${rest.map((x) => `#${x.index} ${x.header}`).join(", ")} not shown)`);
      break;
    }
    parts.push(text);
    used += text.length;
  }
  return parts.join("\n");
}

export const DIFF_FORMAT_NOTE =
  "Each hunk starts with '#<n> @@ ... @@'. Lines show '+<new line> |' for additions, '-o<old line> |' for removals and ' <new line> |' for context.";
