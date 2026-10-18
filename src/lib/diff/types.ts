export type DiffFileStatus = "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";

/** A file in a pull request diff, as stored in a snapshot. */
export type DiffFile = {
  path: string;
  previousPath?: string | null;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  /** Unified diff hunks without file headers. null when binary or too large. */
  patch: string | null;
  /** Blob sha of the head version. */
  sha?: string | null;
};

export type DiffLineType = "context" | "add" | "del";

export type DiffLine = {
  type: DiffLineType;
  content: string;
  oldNumber: number | null;
  newNumber: number | null;
  /** "\ No newline at end of file" followed this line */
  noNewline?: boolean;
};

export type DiffHunk = {
  /** 1-based index within the file */
  index: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the second @@ (often the enclosing function) */
  heading: string;
  lines: DiffLine[];
};

export type ParsedFile = DiffFile & { hunks: DiffHunk[] };
