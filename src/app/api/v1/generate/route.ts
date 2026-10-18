import { z } from "zod";
import { resolveAiConfig } from "@/lib/ai/config";
import { apiPrincipal, resolvePullForApi, workspaceOf } from "@/lib/api-v1";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { failStaleGuides, getLatestGuide, guideUrl, isStaleGuide, startGuide } from "@/lib/guides/service";
import { enqueueJob } from "@/lib/jobs/queue";

/** POST /api/v1/generate {"pr": "<url>"} — generate a guide with the workspace's AI provider. */
export async function POST(req: Request) {
  try {
    const p = await apiPrincipal(req);
    const parsed = z.object({ pr: z.string() }).safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "pr is required");
    const ws = await workspaceOf(p.workspaceId);
    const cfg = resolveAiConfig(ws);
    if (!cfg) throw new HttpError(409, "No AI provider is configured for this workspace");
    const { ctx, number } = await resolvePullForApi(p, parsed.data.pr);
    const latest = await getLatestGuide(ctx.repo.id, number);
    if (latest && latest.status === "generating" && !isStaleGuide(latest)) {
      throw new HttpError(409, `Version ${latest.version} of this guide is still being written (${guideUrl(ws.slug, ctx.repo.fullName, number, latest.version)}).`);
    }
    if (latest && isStaleGuide(latest)) await failStaleGuides();
    const { guide } = await startGuide({
      workspaceId: ws.id,
      ctx,
      prNumber: number,
      source: "ai",
      createdVia: "api",
      author: cfg.model,
      userId: p.user.id,
    });
    await enqueueJob("generate_guide", { guideId: guide.id }, { dedupeKey: `gen-guide:${guide.id}`, maxAttempts: 2 });
    return Response.json({ id: guide.id, version: guide.version, status: guide.status, url: guideUrl(ws.slug, ctx.repo.fullName, number, guide.version) }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
