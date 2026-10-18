import { ghFileContent } from "@/lib/github/client";
import type { RepoContext } from "@/lib/github/connections";
import { parsePatch } from "./parse";
import { languageForPath, Palette, tokenize, type Tok } from "./highlight";
import type { DiffFile } from "./types";

export type ViewLine = {
  /** c = context, a = added, d = deleted */
  t: "c" | "a" | "d";
  o: number | null;
  n: number | null;
};

export type ViewHunk = {
  index: number;
  header: string;
  heading: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ViewLine[];
};

export type FileView = {
  path: string;
  previousPath: string | null;
  status: DiffFile["status"];
  additions: number;
  deletions: number;
  language: string | null;
  binary: boolean;
  hunks: ViewHunk[];
  /** Tokens of the whole head version (null if unavailable) */
  newFile: Tok[][] | null;
  /** Tokens of base lines by line number (deleted lines, or the whole file for removed files) */
  oldLines: Record<number, Tok[]>;
  oldLineCount: number | null;
  /** Fallback tokens per hunk line when file contents are unavailable */
  hunkTokens: Tok[][][] | null;
  palette: string[];
};

const MAX_LINES = 6000;

type CacheEntry = { view: FileView; at: number };
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 150;

function remember(key: string, view: FileView) {
  cache.set(key, { view, at: Date.now() });
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function stripCr(lines: string[]): string[] {
  return lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

function splitLines(content: string): string[] {
  const lines = stripCr(content.split("\n"));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Build the render model for one file of a snapshot: parsed hunks plus
 * syntax-highlighted full contents (for expanding context) when available.
 */
export async function buildFileView(
  /** Without a repository context (no GitHub connection) the view is built from the patch alone. */
  ctx: RepoContext | null,
  file: DiffFile,
  shas: { head: string; mergeBase: string; snapshotId: string },
): Promise<FileView> {
  const key = `${shas.snapshotId}:${file.path}`;
  const hit = cache.get(key);
  if (hit) return hit.view;

  const hunks = parsePatch(file.patch);
  const language = languageForPath(file.path);
  const palette = new Palette();
  const binary = file.patch === null;

  const viewHunks: ViewHunk[] = hunks.map((h) => ({
    index: h.index,
    header: h.header,
    heading: h.heading,
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.map((l) => ({ t: l.type === "add" ? "a" : l.type === "del" ? "d" : "c", o: l.oldNumber, n: l.newNumber })),
  }));

  let newFile: Tok[][] | null = null;
  const oldLines: Record<number, Tok[]> = {};
  let oldLineCount: number | null = null;
  let hunkTokens: Tok[][][] | null = null;

  if (!binary) {
    const wantNew = file.status !== "removed";
    const wantOld = file.status !== "added" && hunks.some((h) => h.lines.some((l) => l.type === "del"));
    const fetchContent = (path: string, ref: string) =>
      ctx ? ghFileContent(ctx.token, ctx.repo.owner, ctx.repo.name, path, ref).catch(() => null) : Promise.resolve(null);
    const [newContent, oldContent] = await Promise.all([
      wantNew ? fetchContent(file.path, shas.head) : Promise.resolve(null),
      wantOld ? fetchContent(file.previousPath ?? file.path, shas.mergeBase) : Promise.resolve(null),
    ]);

    let newOk = false;
    if (newContent !== null) {
      const lines = splitLines(newContent);
      // Verify the content matches the patch before trusting line numbers.
      newOk =
        lines.length <= MAX_LINES &&
        hunks.every((h) =>
          h.lines.every((l) => l.type === "del" || l.newNumber === null || lines[l.newNumber - 1] === l.content),
        );
      if (newOk) newFile = await tokenize(lines.join("\n"), language, palette);
    }

    let oldOk = !wantOld;
    if (oldContent !== null) {
      const lines = splitLines(oldContent);
      oldOk =
        lines.length <= MAX_LINES &&
        hunks.every((h) =>
          h.lines.every((l) => l.type === "add" || l.oldNumber === null || lines[l.oldNumber - 1] === l.content),
        );
      if (oldOk) {
        oldLineCount = lines.length;
        const toks = await tokenize(lines.join("\n"), language, palette);
        if (file.status === "removed") {
          toks.forEach((t, i) => (oldLines[i + 1] = t));
        } else {
          for (const h of hunks) for (const l of h.lines) if (l.type === "del" && l.oldNumber) oldLines[l.oldNumber] = toks[l.oldNumber - 1] ?? [[l.content, 0]];
        }
      }
    }

    if ((wantNew && !newOk) || !oldOk) {
      // Highlight the patch itself: new side and old side as separate streams.
      const newSide: string[] = [];
      const oldSide: string[] = [];
      for (const h of hunks) {
        for (const l of h.lines) {
          if (l.type !== "del") newSide.push(l.content);
          if (l.type !== "add") oldSide.push(l.content);
        }
      }
      const [nt, ot] = await Promise.all([
        tokenize(newSide.join("\n"), language, palette),
        tokenize(oldSide.join("\n"), language, palette),
      ]);
      let ni = 0;
      let oi = 0;
      hunkTokens = hunks.map((h) =>
        h.lines.map((l) => {
          if (l.type === "del") return ot[oi++] ?? [[l.content, 0]];
          const t = nt[ni++] ?? [[l.content, 0]];
          if (l.type === "context") oi++;
          return t;
        }),
      );
      if (!newOk) newFile = null;
    }
  }

  const view: FileView = {
    path: file.path,
    previousPath: file.previousPath ?? null,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    language,
    binary,
    hunks: viewHunks,
    newFile,
    oldLines,
    oldLineCount,
    hunkTokens,
    palette: palette.colors,
  };
  // A patch-only view is not cached, so full contents load once a connection is back.
  if (ctx) remember(key, view);
  return view;
}
