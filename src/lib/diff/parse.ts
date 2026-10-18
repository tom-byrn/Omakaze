import type { DiffFile, DiffFileStatus, DiffHunk, ParsedFile } from "./types";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** Parse the hunks of a single-file unified diff (GitHub's `patch` field). */
export function parsePatch(patch: string | null | undefined): DiffHunk[] {
  if (!patch) return [];
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let remainingOld = 0;
  let remainingNew = 0;

  const lines = patch.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const inHunk: boolean = current !== null && (remainingOld > 0 || remainingNew > 0);
    // Content lines start with a space, +, - or a backslash, so a line starting with @@ is a header.
    const match: RegExpExecArray | null = HUNK_RE.exec(line);
    if (match) {
      current = {
        index: hunks.length + 1,
        header: line,
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        heading: (match[5] ?? "").trim(),
        lines: [],
      };
      hunks.push(current);
      oldNo = current.oldStart;
      newNo = current.newStart;
      remainingOld = current.oldLines;
      remainingNew = current.newLines;
      continue;
    }
    if (!current) continue;

    const marker = line[0];
    if (marker === "\\") {
      const last = current.lines[current.lines.length - 1];
      if (last) last.noNewline = true;
      continue;
    }
    if (!inHunk) continue;

    if (marker === "+") {
      current.lines.push({ type: "add", content: line.slice(1), oldNumber: null, newNumber: newNo++ });
      remainingNew--;
    } else if (marker === "-") {
      current.lines.push({ type: "del", content: line.slice(1), oldNumber: oldNo++, newNumber: null });
      remainingOld--;
    } else {
      current.lines.push({
        type: "context",
        content: line.length > 0 ? line.slice(1) : "",
        oldNumber: oldNo++,
        newNumber: newNo++,
      });
      remainingOld--;
      remainingNew--;
    }
  }
  return hunks;
}

export function parseFile(file: DiffFile): ParsedFile {
  return { ...file, hunks: parsePatch(file.patch) };
}

export function parseFiles(files: DiffFile[]): ParsedFile[] {
  return files.map(parseFile);
}

/**
 * Parse a multi-file git diff (`git diff` output) into DiffFiles.
 * Used for tests and for importing diffs that did not come from the GitHub API.
 */
export function parseGitDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const chunks = diff.split(/^diff --git /m).filter((c) => c.trim().length > 0);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const header = lines[0] ?? "";
    const headerMatch = /^a\/(.+?) b\/(.+)$/.exec(header.trim());
    let oldPath = headerMatch?.[1] ?? null;
    let newPath = headerMatch?.[2] ?? null;
    let status: DiffFileStatus = "modified";
    let binary = false;
    let i = 1;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith("@@")) break;
      if (l.startsWith("new file mode")) status = "added";
      else if (l.startsWith("deleted file mode")) status = "removed";
      else if (l.startsWith("rename from ")) {
        oldPath = l.slice("rename from ".length);
        status = "renamed";
      } else if (l.startsWith("rename to ")) newPath = l.slice("rename to ".length);
      else if (l.startsWith("--- ")) {
        const p = l.slice(4);
        if (p !== "/dev/null") oldPath = p.replace(/^a\//, "");
      } else if (l.startsWith("+++ ")) {
        const p = l.slice(4);
        if (p !== "/dev/null") newPath = p.replace(/^b\//, "");
      } else if (l.startsWith("Binary files")) binary = true;
    }
    const patch = lines.slice(i).join("\n").replace(/\n+$/, "");
    const hunks = parsePatch(patch);
    let additions = 0;
    let deletions = 0;
    for (const h of hunks) {
      for (const l of h.lines) {
        if (l.type === "add") additions++;
        else if (l.type === "del") deletions++;
      }
    }
    const path = status === "removed" ? (oldPath ?? newPath ?? "") : (newPath ?? oldPath ?? "");
    files.push({
      path,
      previousPath: status === "renamed" ? oldPath : null,
      status,
      additions,
      deletions,
      patch: binary || patch.length === 0 ? null : patch,
    });
  }
  return files;
}

/** Count changed lines (additions + deletions) of a parsed file. */
export function changedLineCount(file: ParsedFile): number {
  let n = 0;
  for (const h of file.hunks) for (const l of h.lines) if (l.type !== "context") n++;
  return n;
}
