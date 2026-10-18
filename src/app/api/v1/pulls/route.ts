import { apiPrincipal } from "@/lib/api-v1";
import { loadDashboard, parseStateFilter } from "@/lib/dashboard";
import { errorResponse } from "@/lib/http";

/** GET /api/v1/pulls?state=open|closed|merged|all — cached pull requests with guide status. */
export async function GET(req: Request) {
  try {
    const p = await apiPrincipal(req);
    const state = parseStateFilter(new URL(req.url).searchParams.get("state"));
    const data = await loadDashboard(p.workspaceId, { state });
    const names = new Map(data.repos.map((r) => [r.id, r.fullName]));
    return Response.json({
      pulls: data.pulls.map((pr) => {
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
