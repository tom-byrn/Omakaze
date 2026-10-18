import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { diffSnapshots, pullRequests, repositories } from "@/db/schema";
import type { DiffFile } from "@/lib/diff/types";
import { gh, ghPaginate, GitHubError, type GhPull, type GhPullFile } from "./client";
import type { RepoContext } from "./connections";

export type PullRow = typeof pullRequests.$inferSelect;
export type Snapshot = typeof diffSnapshots.$inferSelect;

export class StaleHeadError extends Error {
  constructor(public currentHeadSha: string) {
    super(`The pull request has new commits (head is now ${currentHeadSha.slice(0, 7)}). Re-read it and try again.`);
  }
}

function pullValues(repositoryId: string, p: GhPull) {
  const base = {
    repositoryId,
    number: p.number,
    githubId: p.id,
    title: p.title,
    body: p.body,
    state: p.state,
    merged: Boolean(p.merged_at) || Boolean(p.merged),
    draft: Boolean(p.draft),
    authorLogin: p.user?.login ?? null,
    authorAvatarUrl: p.user?.avatar_url ?? null,
    headRef: p.head.ref,
    headSha: p.head.sha,
    baseRef: p.base.ref,
    baseSha: p.base.sha,
    htmlUrl: p.html_url,
    githubCreatedAt: new Date(p.created_at),
    githubUpdatedAt: new Date(p.updated_at),
    mergedAt: p.merged_at ? new Date(p.merged_at) : null,
    closedAt: p.closed_at ? new Date(p.closed_at) : null,
    syncedAt: new Date(),
  };
  const hasDetails = typeof p.additions === "number";
  return hasDetails
    ? {
        ...base,
        additions: p.additions ?? null,
        deletions: p.deletions ?? null,
        changedFiles: p.changed_files ?? null,
        commits: p.commits ?? null,
        detailsSha: p.head.sha,
      }
    : base;
}

export async function upsertPull(repositoryId: string, p: GhPull): Promise<PullRow> {
  const values = pullValues(repositoryId, p);
  const { repositoryId: _r, number: _n, ...updates } = values;
  void _r;
  void _n;
  const [row] = await db
    .insert(pullRequests)
    .values(values)
    .onConflictDoUpdate({ target: [pullRequests.repositoryId, pullRequests.number], set: updates })
    .returning();
  return row;
}

/** Fetch one PR from GitHub (with additions/deletions) and cache it. */
export async function syncPull(ctx: RepoContext, number: number): Promise<PullRow> {
  const p = await gh<GhPull>(ctx.token, `/repos/${ctx.repo.owner}/${ctx.repo.name}/pulls/${number}`);
  return upsertPull(ctx.repo.id, p);
}

/** Refresh the cached PR list of a repository (all open PRs + recently closed ones). */
export async function syncRepositoryPulls(
  ctx: RepoContext,
  opts: { detailsLimit?: number } = {},
): Promise<{ synced: number; error: string | null }> {
  const { owner, name } = ctx.repo;
  try {
    const [open, closed] = await Promise.all([
      ghPaginate<GhPull>(ctx.token, `/repos/${owner}/${name}/pulls`, {
        query: { state: "open", sort: "updated", direction: "desc" },
        maxItems: 300,
      }),
      gh<GhPull[]>(ctx.token, `/repos/${owner}/${name}/pulls`, {
        query: { state: "closed", sort: "updated", direction: "desc", per_page: 50 },
      }),
    ]);
    const all = [...open, ...closed];
    for (const p of all) await upsertPull(ctx.repo.id, p);

    // Fetch line stats for open PRs whose head changed since we last looked.
    const numbers = open.map((p) => p.number);
    if (numbers.length > 0) {
      const rows = await db
        .select({ number: pullRequests.number, headSha: pullRequests.headSha, detailsSha: pullRequests.detailsSha })
        .from(pullRequests)
        .where(and(eq(pullRequests.repositoryId, ctx.repo.id), inArray(pullRequests.number, numbers)));
      const stale = rows.filter((r) => r.detailsSha !== r.headSha).slice(0, opts.detailsLimit ?? 20);
      await Promise.all(stale.map((r) => syncPull(ctx, r.number).catch(() => null)));
    }
    await db
      .update(repositories)
      .set({ lastSyncedAt: new Date(), syncError: null })
      .where(eq(repositories.id, ctx.repo.id));
    return { synced: all.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(repositories)
      .set({ lastSyncedAt: new Date(), syncError: message.slice(0, 500) })
      .where(eq(repositories.id, ctx.repo.id));
    return { synced: 0, error: message };
  }
}

/** Cached PR rows are refreshed when stale or missing line stats. */
export function pullNeedsRefresh(pull: PullRow, maxAgeMs = 60_000): boolean {
  return pull.detailsSha !== pull.headSha || Date.now() - pull.syncedAt.getTime() > maxAgeMs;
}

export async function getCachedPull(repositoryId: string, number: number): Promise<PullRow | null> {
  const [row] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.number, number)))
    .limit(1);
  return row ?? null;
}

function toDiffFile(f: GhPullFile): DiffFile {
  return {
    path: f.filename,
    previousPath: f.previous_filename ?? null,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
    sha: f.sha,
  };
}

/**
 * Get (or create) an immutable snapshot of a PR's diff at its current head.
 * Hunk numbers shown to agents always refer to a snapshot, so references stay stable.
 */
export async function getOrCreateSnapshot(
  ctx: RepoContext,
  number: number,
  opts: { expectedHeadSha?: string | null } = {},
): Promise<{ snapshot: Snapshot; pull: PullRow }> {
  const { owner, name } = ctx.repo;
  const p = await gh<GhPull>(ctx.token, `/repos/${owner}/${name}/pulls/${number}`, { noCache: true });
  const pull = await upsertPull(ctx.repo.id, p);
  if (opts.expectedHeadSha && !p.head.sha.startsWith(opts.expectedHeadSha) && opts.expectedHeadSha !== p.head.sha) {
    // allow a snapshot that already exists for the expected head
    const [old] = await db
      .select()
      .from(diffSnapshots)
      .where(
        and(
          eq(diffSnapshots.repositoryId, ctx.repo.id),
          eq(diffSnapshots.prNumber, number),
          eq(diffSnapshots.headSha, opts.expectedHeadSha),
        ),
      )
      .limit(1);
    if (old) return { snapshot: old, pull };
    throw new StaleHeadError(p.head.sha);
  }

  const [existing] = await db
    .select()
    .from(diffSnapshots)
    .where(
      and(
        eq(diffSnapshots.repositoryId, ctx.repo.id),
        eq(diffSnapshots.prNumber, number),
        eq(diffSnapshots.headSha, p.head.sha),
      ),
    )
    .limit(1);
  if (existing) return { snapshot: existing, pull };

  const files = await ghPaginate<GhPullFile>(ctx.token, `/repos/${owner}/${name}/pulls/${number}/files`, {
    maxItems: 3000,
  });
  let mergeBase = p.base.sha;
  try {
    const cmp = await gh<{ merge_base_commit?: { sha: string } }>(
      ctx.token,
      `/repos/${owner}/${name}/compare/${p.base.sha}...${p.head.sha}`,
      { query: { per_page: 1 } },
    );
    if (cmp.merge_base_commit?.sha) mergeBase = cmp.merge_base_commit.sha;
  } catch (err) {
    if (!(err instanceof GitHubError)) throw err;
  }

  await db
    .insert(diffSnapshots)
    .values({
      repositoryId: ctx.repo.id,
      prNumber: number,
      headSha: p.head.sha,
      baseSha: p.base.sha,
      mergeBaseSha: mergeBase,
      files: files.map(toDiffFile),
      truncated: (p.changed_files ?? 0) > files.length,
    })
    .onConflictDoNothing();
  const [snapshot] = await db
    .select()
    .from(diffSnapshots)
    .where(
      and(
        eq(diffSnapshots.repositoryId, ctx.repo.id),
        eq(diffSnapshots.prNumber, number),
        eq(diffSnapshots.headSha, p.head.sha),
      ),
    )
    .limit(1);
  return { snapshot, pull };
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const [s] = await db.select().from(diffSnapshots).where(eq(diffSnapshots.id, id)).limit(1);
  return s ?? null;
}

export async function latestPulls(repositoryIds: string[], limit = 200): Promise<PullRow[]> {
  if (repositoryIds.length === 0) return [];
  return db
    .select()
    .from(pullRequests)
    .where(inArray(pullRequests.repositoryId, repositoryIds))
    .orderBy(desc(pullRequests.githubUpdatedAt))
    .limit(limit);
}

/** Parse a GitHub PR URL like https://github.com/acme/web/pull/42 (or "acme/web#42"). */
export function parsePullUrl(input: string): { owner: string; repo: string; number: number } | null {
  const s = input.trim();
  const url = /^(?:https?:\/\/[^/]+\/)?([\w.-]+)\/([\w.-]+)\/pulls?\/(\d+)/i.exec(s);
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  const short = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(s);
  if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };
  return null;
}
