import { apiPrincipal } from "@/lib/api-v1";
import { findWorkspaceRepo } from "@/lib/github/connections";
import { loadDashboard, parseStateFilter } from "@/lib/dashboard";
import { errorResponse, HttpError } from "@/lib/http";

/** GET /api/v1/pulls?state=open|closed|merged|all&repo=owner/name — cached pull requests with guide status. */
export async function GET(req: Request) {
  try {
    const p = await apiPrincipal(req);
    const params = new URL(req.url).searchParams;
    const state = parseStateFilter(params.get("state"));
    const repoParam = params.get("repo")?.trim();
    let repositoryId: string | undefined;
    if (repoParam) {
      const [owner, name] = repoParam.split("/");
      const repo = owner && name ? await findWorkspaceRepo(p.workspaceId, owner, name) : null;
      if (!repo) throw new HttpError(404, `${repoParam} is not followed by this workspace`);
      repositoryId = repo.id;
    }
    const data = await loadDashboard(p.workspaceId, { state, repositoryId });
    const names = new Map(data.repos.map((r) => [r.id, r.fullName]));
    const pulls = data.pulls;
    return Response.json({
      pulls: pulls.map((pr) => {
        const g = data.guides.get(`${pr.repositoryId}:${pr.number}`);
        return {
          repository: names.get(pr.repositoryId),
          number: pr.number,
          title: pr.title,
          state: pr.merged ? "merged" : pr.state,
          draft: pr.draft,
          author: pr.authorLogin,
          url: pr.htmlUrl,
          updated_at: pr.githubUpdatedAt,
          guide: g ? { version: g.version, status: g.status, head_sha: g.headSha } : null,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
