import { resolveAiConfigFor } from "@/lib/ai/chatgpt";
import { getGitHubAccount } from "@/lib/auth/users";
import { getRepoContext } from "@/lib/github/connections";
import { getGuideCheckView } from "@/lib/github/guide-check";
import { getCachedPull, pullNeedsRefresh, syncPull } from "@/lib/github/pulls";
import { getGuide, listGuideVersions } from "@/lib/guides/service";
import { missingRequiredSections } from "@/lib/guides/template-store";
import { loadGuideData } from "@/lib/guides/view";
import { errorResponse, HttpError } from "@/lib/http";
import { mobileContext, NO_STORE, repoParam } from "@/lib/mobile/context";
import { agentPrompt } from "@/lib/prompts";

/**
 * GET /api/mobile/pull?repo=owner/name&number=412&v=2 — a pull request and one version of its guide
 * (the latest without `v`), with everything the guide viewer shows. Opening it records a visit, and
 * carries the viewer's review marks forward, as the web viewer does.
 */
export async function GET(req: Request) {
  try {
    const ctx = await mobileContext(req);
    const params = new URL(req.url).searchParams;
    const repo = await repoParam(ctx, params.get("repo"));
    const number = Number(params.get("number"));
    if (!Number.isInteger(number) || number < 1) throw new HttpError(400, "number must be a pull request number");

    let pull = await getCachedPull(repo.id, number);
    if (!pull || pullNeedsRefresh(pull) || params.get("refresh") === "1") {
      try {
        pull = await syncPull(await getRepoContext(repo.id), number);
      } catch {
        if (!pull) throw new HttpError(404, `${repo.fullName}#${number} was not found`);
      }
    }
    const versions = await listGuideVersions(repo.id, number);
    const requested = Number(params.get("v"));
    const meta = versions.find((v) => v.version === requested) ?? versions[0] ?? null;
    const guide = meta ? await getGuide(meta.id) : null;
    const [ai, check, account] = await Promise.all([
      resolveAiConfigFor(ctx.workspace, ctx.user.id),
      getGuideCheckView(repo.id, number),
      getGitHubAccount(ctx.user.id),
    ]);
    const template = guide?.template?.sections.length && guide.status !== "generating" ? guide.template : null;
    const templateGaps = template && guide ? await missingRequiredSections(guide) : [];
    const data = guide ? await loadGuideData(guide, ctx.user.id) : null;

    return Response.json(
      {
        repo: { id: repo.id, fullName: repo.fullName, htmlUrl: repo.htmlUrl },
        pull: {
          number: pull.number,
          title: pull.title,
          body: pull.body,
          state: pull.merged ? "merged" : pull.state,
          draft: pull.draft,
          author: pull.authorLogin,
          authorAvatarUrl: pull.authorAvatarUrl,
          headRef: pull.headRef,
          baseRef: pull.baseRef,
          headSha: pull.headSha,
          additions: pull.additions,
          deletions: pull.deletions,
          changedFiles: pull.changedFiles,
          url: pull.htmlUrl,
          updatedAt: pull.githubUpdatedAt,
          requestedReviewers: pull.requestedReviewers,
          requestedTeams: pull.requestedTeams,
          assignees: pull.assignees,
        },
        versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, headSha: v.headSha, author: v.author, source: v.source, createdAt: v.createdAt })),
        check,
        agentPrompt: agentPrompt(pull.htmlUrl),
        me: { id: ctx.user.id, name: ctx.user.name, hasGitHub: Boolean(account) },
        canGenerate: Boolean(ai),
        guide:
          guide && data
            ? {
                id: guide.id,
                title: guide.title,
                summary: guide.summary,
                version: guide.version,
                status: guide.status,
                error: guide.error,
                headSha: guide.headSha,
                author: guide.author,
                source: guide.source,
                createdVia: guide.createdVia,
                createdAt: guide.createdAt,
                outdated: guide.headSha !== pull.headSha,
                template: template ? { name: template.name, missing: templateGaps.map((s) => s.title) } : null,
                sections: data.sections.map((s) => ({
                  id: s.id,
                  position: s.position,
                  title: s.title,
                  body: s.body,
                  refs: s.refs,
                  generated: s.generated,
                  files: s.stats.files,
                  additions: s.stats.additions,
                  deletions: s.stats.deletions,
                  reviewedBy: s.reviewedBy,
                  carriedFrom: s.carriedFrom,
                  reviewChange: s.reviewChange,
                  visitChange: s.visitChange,
                })),
                files: data.files.map((f) => ({
                  path: f.path,
                  previousPath: f.previousPath ?? null,
                  status: f.status,
                  additions: f.additions,
                  deletions: f.deletions,
                  sections: data.fileSections[f.path] ?? [],
                })),
                coverage: { total: data.coverage.totalChanged, covered: data.coverage.coveredChanged },
                members: data.members,
                lastVisitAt: data.lastVisitAt,
                sinceVisit: data.sinceVisit,
              }
            : null,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
