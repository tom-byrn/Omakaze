import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { repositories } from "@/db/schema";
import { isPullFilter, loadDashboard, parseStateFilter, PULL_FILTERS } from "@/lib/dashboard";
import { getRepoContext } from "@/lib/github/connections";
import { githubLoginOf } from "@/lib/github/people";
import { syncRepositoryPulls } from "@/lib/github/pulls";
import { errorResponse, HttpError } from "@/lib/http";
import { mobileContext, NO_STORE, repoParam } from "@/lib/mobile/context";

const STALE_MS = 60_000;

/**
 * GET /api/mobile/pulls?state=open&filter=needs-review&repo=owner/name&q=text&sync=1
 * — the pull request list with the counts for the state and filter tabs. `sync=1` refreshes the
 * cache from GitHub first (repositories not synced in the last minute, or all with `sync=force`).
 */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const params = new URL(req.url).searchParams;
    const state = parseStateFilter(params.get("state"));
    const filter = params.get("filter")?.trim() || "all";
    if (!isPullFilter(filter)) throw new HttpError(400, `filter must be one of ${PULL_FILTERS.join(", ")}`);
    const repo = params.get("repo") ? await repoParam(ctx, params.get("repo")) : null;
    const sync = params.get("sync");
    const errors: string[] = [];
    if (sync === "1" || sync === "force") {
      const staleBefore = new Date(Date.now() - (sync === "force" ? 0 : STALE_MS));
      const repos = await db
        .select()
        .from(repositories)
        .where(
          and(
            eq(repositories.workspaceId, ctx.workspace.id),
            repo ? eq(repositories.id, repo.id) : undefined,
            sync === "force" ? undefined : or(isNull(repositories.lastSyncedAt), lt(repositories.lastSyncedAt, staleBefore)),
          ),
        );
      await Promise.all(
        repos.map(async (r) => {
          try {
            const result = await syncRepositoryPulls(await getRepoContext(r.id));
            if (result.error) errors.push(`${r.fullName}: ${result.error}`);
          } catch (err) {
            errors.push(`${r.fullName}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }),
      );
    }
    const viewer = { userId: ctx.user.id, login: await githubLoginOf(ctx.user.id) };
    const data = await loadDashboard(ctx.workspace.id, { state, filter, repositoryId: repo?.id, q: params.get("q") ?? undefined, viewer });
    const names = new Map(data.repos.map((r) => [r.id, r.fullName]));
    return Response.json(
      {
        counts: data.counts,
        filterCounts: data.filterCounts,
        viewerLogin: data.viewerLogin,
        syncErrors: errors,
        pulls: data.pulls.map((pr) => {
          const key = `${pr.repositoryId}:${pr.number}`;
          const g = data.guides.get(key);
          const progress = data.progress.get(key);
          return {
            repository: names.get(pr.repositoryId) ?? "",
            number: pr.number,
            title: pr.title,
            state: pr.merged ? "merged" : pr.state,
            draft: pr.draft,
            author: pr.authorLogin,
            authorAvatarUrl: pr.authorAvatarUrl,
            headRef: pr.headRef,
            baseRef: pr.baseRef,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changedFiles,
            url: pr.htmlUrl,
            updatedAt: pr.githubUpdatedAt,
            guide: g ? { id: g.id, version: g.version, status: g.status, headSha: g.headSha, outdated: g.headSha !== pr.headSha } : null,
            requestedReviewers: pr.requestedReviewers,
            requestedTeams: pr.requestedTeams,
            assignees: pr.assignees,
            reviewProgress: progress ? { version: progress.version, sections: progress.sections, reviewed: progress.reviewed } : null,
          };
        }),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
