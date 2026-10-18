export type ReviewComment = {
  id: number;
  inReplyTo: number | null;
  path: string;
  line: number | null;
  originalLine: number | null;
  startLine: number | null;
  side: "LEFT" | "RIGHT";
  body: string;
  user: { login: string; avatarUrl: string } | null;
  createdAt: string;
  htmlUrl: string;
  outdated: boolean;
};

export type Thread = { root: ReviewComment; replies: ReviewComment[] };

export type FocusTarget = { path: string; start: number | null; end: number | null; side: "new" | "old"; nonce: number };

export function threadKey(side: "LEFT" | "RIGHT", line: number): string {
  return `${side}:${line}`;
}

/** Group a flat comment list into threads keyed by path → side:line. */
export function groupThreads(comments: ReviewComment[]): Map<string, Map<string, Thread[]>> {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = new Map<number, Thread>();
  const rootOf = (c: ReviewComment): ReviewComment => {
    let cur = c;
    const seen = new Set<number>();
    while (cur.inReplyTo && byId.has(cur.inReplyTo) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.inReplyTo)!;
    }
    return cur;
  };
  for (const c of comments) {
    const root = rootOf(c);
    const t = roots.get(root.id) ?? { root, replies: [] };
    if (c.id !== root.id) t.replies.push(c);
    roots.set(root.id, t);
  }
  const out = new Map<string, Map<string, Thread[]>>();
  for (const t of roots.values()) {
    if (t.root.line === null) continue;
    t.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const file = out.get(t.root.path) ?? new Map<string, Thread[]>();
    const key = threadKey(t.root.side, t.root.line);
    file.set(key, [...(file.get(key) ?? []), t]);
    out.set(t.root.path, file);
  }
  return out;
}
