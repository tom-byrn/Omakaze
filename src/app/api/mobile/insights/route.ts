import { errorResponse, HttpError } from "@/lib/http";
import { GUIDE_ORIGINS, ORIGIN_LABELS, parseRange } from "@/lib/insights/model";
import {
  backfillCoverage,
  completion,
  coverage,
  guidesCreated,
  hotFiles,
  hotSections,
  insightRepos,
  insightScope,
  memberStats,
  reviewSpeed,
  templateCompliance,
  unreviewedSections,
} from "@/lib/insights/queries";
import { mobileContext, NO_STORE } from "@/lib/mobile/context";

/** GET /api/mobile/insights?days=30&repo=owner/name — every insights panel as JSON (what the Insights page shows). */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const params = new URL(req.url).searchParams;
    const days = parseRange(params.get("days"));
    const repos = await insightRepos(ctx.workspace.id);
    const repoName = params.get("repo")?.toLowerCase();
    const repo = repoName ? repos.find((r) => r.fullName.toLowerCase() === repoName) : null;
    if (repoName && !repo) throw new HttpError(404, "Repository not found");
    const scope = insightScope(ctx.workspace.id, days, repo?.id ?? null);
    await backfillCoverage(ctx.workspace.id);
    const [created, speed, done, unreviewed, sections, files, cov, members, templates] = await Promise.all([
      guidesCreated(scope),
      reviewSpeed(scope),
      completion(scope),
      unreviewedSections(scope),
      hotSections(scope),
      hotFiles(scope),
      coverage(scope),
      memberStats(scope, { userId: ctx.user.id, role: ctx.role }),
      templateCompliance(scope),
    ]);
    return Response.json(
      {
        days,
        repo: repo?.fullName ?? null,
        repos: repos.map((r) => r.fullName),
        origins: GUIDE_ORIGINS.map((o) => ({ key: o, label: ORIGIN_LABELS[o] })),
        created,
        speed,
        completion: done,
        unreviewed,
        hotSections: sections,
        hotFiles: files,
        coverage: cov,
        members,
        templates,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
