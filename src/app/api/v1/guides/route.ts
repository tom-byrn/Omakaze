import { z } from "zod";
import { apiPrincipal, resolvePullForApi, workspaceOf } from "@/lib/api-v1";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { serializeRef, type RefInput } from "@/lib/guides/refs";
import { createCompleteGuide, getGuide, getSections, guideUrl, GuideError, listGuideVersions } from "@/lib/guides/service";
import { StaleHeadError } from "@/lib/github/pulls";

/** GET /api/v1/guides?pr=<url>&version=<n> — read a guide. */
export async function GET(req: Request) {
  try {
    const p = await apiPrincipal(req);
    const url = new URL(req.url);
    const pr = url.searchParams.get("pr");
    if (!pr) throw new HttpError(400, "pr is required");
    const { ctx, number } = await resolvePullForApi(p, pr);
    const versions = await listGuideVersions(ctx.repo.id, number);
    const versionParam = url.searchParams.get("version");
    let meta = versions[0];
    if (versionParam !== null) {
      const wanted = Number(versionParam);
      if (!Number.isInteger(wanted) || wanted < 1) throw new HttpError(400, "version must be a positive integer");
      meta = versions.find((v) => v.version === wanted)!;
      if (!meta) throw new HttpError(404, `No version ${wanted} of this guide`);
    }
    if (!meta) throw new HttpError(404, "No guide for this pull request");
    const guide = (await getGuide(meta.id))!;
    const ws = await workspaceOf(p.workspaceId);
    const sections = await getSections(guide.id);
    return Response.json({
      id: guide.id,
      version: guide.version,
      status: guide.status,
      title: guide.title,
      summary: guide.summary,
      head_sha: guide.headSha,
      url: guideUrl(ws.slug, ctx.repo.fullName, number, guide.version),
      versions: versions.map((v) => ({ version: v.version, status: v.status, head_sha: v.headSha })),
      sections: sections.map((s) => ({ id: s.id, position: s.position, title: s.title, body: s.body, refs: s.refs.map(serializeRef), automatic: s.generated })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const refSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    hunks: z.array(z.number().int()).optional(),
    lines: z.object({ start: z.number().int(), end: z.number().int(), side: z.enum(["new", "old"]).optional() }).optional(),
    note: z.string().optional(),
    expand: z.enum(["none", "function", "file"]).optional(),
  }),
]);

const createSchema = z.object({
  pr: z.string(),
  head_sha: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().default(""),
  sections: z.array(z.object({ title: z.string().min(1), body: z.string().default(""), refs: z.array(refSchema).default([]) })).min(1),
  auto_cover: z.boolean().optional(),
});

/** POST /api/v1/guides — create a complete guide (same as the MCP create_guide tool). */
export async function POST(req: Request) {
  try {
    const p = await apiPrincipal(req);
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const body = parsed.data;
    const { ctx, number } = await resolvePullForApi(p, body.pr);
    try {
      const { guide, coverage, sectionCoverage, warnings } = await createCompleteGuide({
        workspaceId: p.workspaceId,
        ctx,
        prNumber: number,
        title: body.title,
        summary: body.summary,
        source: "agent",
        createdVia: "api",
        author: "API",
        userId: p.user.id,
        expectedHeadSha: body.head_sha,
        sections: body.sections.map((s) => ({ ...s, refs: s.refs as RefInput[] })),
        autoCover: body.auto_cover,
      });
      const ws = await workspaceOf(p.workspaceId);
      return Response.json(
        {
          id: guide.id,
          version: guide.version,
          url: guideUrl(ws.slug, ctx.repo.fullName, number, guide.version),
          // Coverage of the sections you sent; uncovered changes went to "Other changes" unless auto_cover was false.
          coverage: {
            changed_lines: sectionCoverage.totalChanged,
            covered: sectionCoverage.coveredChanged,
            uncovered: sectionCoverage.uncovered,
            added_to_other_changes: sectionCoverage.uncovered.length > 0 && coverage.uncovered.length === 0,
          },
          warnings,
        },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof GuideError) throw new HttpError(422, err.message);
      if (err instanceof StaleHeadError) throw new HttpError(409, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
