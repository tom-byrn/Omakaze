import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { guides, pullRequests, repositories } from "@/db/schema";

export type StateFilter = "open" | "closed" | "merged" | "all";

export function parseStateFilter(v: unknown): StateFilter {
  return v === "closed" || v === "merged" || v === "all" ? v : "open";
}

function stateCondition(state: StateFilter): SQL | undefined {
  switch (state) {
    case "open":
      return eq(pullRequests.state, "open");
    case "closed":
      return and(eq(pullRequests.state, "closed"), eq(pullRequests.merged, false));
    case "merged":
      return eq(pullRequests.merged, true);
    default:
      return undefined;
  }
}

export type LatestGuide = {
  id: string;
  repositoryId: string;
  prNumber: number;
  version: number;
  status: "draft" | "generating" | "ready" | "failed";
  headSha: string;
};

export async function latestGuidesFor(workspaceId: string, repositoryIds?: string[]): Promise<Map<string, LatestGuide>> {
  const rows = await db
    .selectDistinctOn([guides.repositoryId, guides.prNumber], {
      id: guides.id,
      repositoryId: guides.repositoryId,
      prNumber: guides.prNumber,
      version: guides.version,
      status: guides.status,
      headSha: guides.headSha,
    })
    .from(guides)
    .where(
      and(
        eq(guides.workspaceId, workspaceId),
        repositoryIds && repositoryIds.length > 0 ? inArray(guides.repositoryId, repositoryIds) : undefined,
      ),
    )
    .orderBy(guides.repositoryId, guides.prNumber, desc(guides.version));
  return new Map(rows.map((r) => [`${r.repositoryId}:${r.prNumber}`, r]));
}

export async function loadDashboard(
  workspaceId: string,
  opts: { state: StateFilter; q?: string; repositoryId?: string },
) {
  const repos = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.workspaceId, workspaceId), opts.repositoryId ? eq(repositories.id, opts.repositoryId) : undefined))
    .orderBy(asc(repositories.fullName));
  const repoIds = repos.map((r) => r.id);
  if (repoIds.length === 0) {
    return { repos, pulls: [], counts: { open: 0, closed: 0, merged: 0, all: 0 }, guides: new Map<string, LatestGuide>() };
  }
  const q = opts.q?.trim();
  const search = q
    ? or(
        ilike(pullRequests.title, `%${q}%`),
        ilike(pullRequests.authorLogin, `%${q}%`),
        ilike(pullRequests.headRef, `%${q}%`),
        /^\d+$/.test(q.replace(/^#/, "")) ? eq(pullRequests.number, Number(q.replace(/^#/, ""))) : undefined,
      )
    : undefined;
  const pulls = await db
    .select()
    .from(pullRequests)
    .where(and(inArray(pullRequests.repositoryId, repoIds), stateCondition(opts.state), search))
    .orderBy(desc(pullRequests.githubUpdatedAt))
    .limit(500);
  const [countRow] = await db
    .select({
      open: sql<number>`count(*) filter (where ${pullRequests.state} = 'open')`.mapWith(Number),
      closed: sql<number>`count(*) filter (where ${pullRequests.state} = 'closed' and not ${pullRequests.merged})`.mapWith(Number),
      merged: sql<number>`count(*) filter (where ${pullRequests.merged})`.mapWith(Number),
      all: sql<number>`count(*)`.mapWith(Number),
    })
    .from(pullRequests)
    .where(and(inArray(pullRequests.repositoryId, repoIds), search));
  return { repos, pulls, counts: countRow, guides: await latestGuidesFor(workspaceId, repoIds) };
}

export function isStale(repos: { lastSyncedAt: Date | null }[], ms = 60_000): boolean {
  return repos.some((r) => !r.lastSyncedAt || Date.now() - r.lastSyncedAt.getTime() > ms);
}
