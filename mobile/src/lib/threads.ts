import type { CommentsResponse, ReviewComment } from './types';

export type Thread = {
  root: ReviewComment;
  replies: ReviewComment[];
  /** GitHub's conversation (GraphQL id and resolved state), when known. */
  id: string | null;
  isResolved: boolean;
  resolvedBy: string | null;
};

/** Review comments grouped into conversations, per file. */
export function threadsByPath(data: CommentsResponse | undefined): Map<string, Thread[]> {
  const out = new Map<string, Thread[]>();
  if (!data) return out;
  const state = new Map((data.threads ?? []).map((t) => [t.id, t]));
  const byId = new Map(data.comments.map((c) => [c.id, c]));
  const rootOf = (c: ReviewComment): ReviewComment => {
    let cur = c;
    for (let i = 0; i < 50 && cur.inReplyTo && byId.has(cur.inReplyTo); i++) cur = byId.get(cur.inReplyTo)!;
    return cur;
  };
  const threads = new Map<number, Thread>();
  for (const c of [...data.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const root = rootOf(c);
    let t = threads.get(root.id);
    if (!t) {
      const s = root.threadId ? state.get(root.threadId) : undefined;
      t = { root, replies: [], id: root.threadId, isResolved: s?.isResolved ?? false, resolvedBy: s?.resolvedBy ?? null };
      threads.set(root.id, t);
    }
    if (c.id !== root.id) t.replies.push(c);
  }
  for (const t of threads.values()) {
    const list = out.get(t.root.path) ?? [];
    list.push(t);
    out.set(t.root.path, list);
  }
  return out;
}

/** Whether a thread belongs on a diff row (by the line it was made on, on its side). */
export function threadOnRow(t: Thread, row: { kind: 'context' | 'add' | 'del'; old: number | null; new: number | null; inHunk: boolean }): boolean {
  if (t.root.line === null || !row.inHunk) return false;
  return t.root.side === 'LEFT' ? row.kind !== 'add' && row.old === t.root.line : row.kind !== 'del' && row.new === t.root.line;
}
