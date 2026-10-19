import { getCurrentUser } from "@/lib/auth/session";
import { errorResponse, HttpError } from "@/lib/http";
import { isInsightPanel, panelCsv } from "@/lib/insights/export";
import { parseRange } from "@/lib/insights/model";
import { backfillCoverage, insightRepos, insightScope } from "@/lib/insights/queries";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

/** GET /api/w/<slug>/insights/<panel>?days=30&repo=owner/name — the table of one insights panel as CSV. */
export async function GET(req: Request, ctx: RouteContext<"/api/w/[slug]/insights/[panel]">) {
  try {
    const { slug, panel } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "Sign in required");
    const ws = await getWorkspaceBySlug(slug);
    const role = ws ? await getMembership(ws.id, user.id) : null;
    if (!ws || !role) throw new HttpError(404, "Not found");
    if (!isInsightPanel(panel)) throw new HttpError(404, "Unknown panel");
    const params = new URL(req.url).searchParams;
    const days = parseRange(params.get("days"));
    const repoName = params.get("repo");
    const repo = repoName ? (await insightRepos(ws.id)).find((r) => r.fullName.toLowerCase() === repoName.toLowerCase()) : null;
    if (repoName && !repo) throw new HttpError(404, "Repository not found");
    if (panel === "coverage") await backfillCoverage(ws.id);
    const csv = await panelCsv(panel, insightScope(ws.id, days, repo?.id ?? null), { userId: user.id, role });
    const file = [ws.slug, panel, `${days}d`, repo?.fullName].filter(Boolean).join("-").replace(/[^A-Za-z0-9._-]+/g, "-");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
