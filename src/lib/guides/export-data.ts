import type { repositories } from "@/db/schema";
import { buildFileView, type FileView } from "@/lib/diff/fileview";
import { parseFiles } from "@/lib/diff/parse";
import { env } from "@/lib/env";
import { getRepoContext } from "@/lib/github/connections";
import { getCachedPull, getSnapshot, type Snapshot } from "@/lib/github/pulls";
import { HttpError } from "@/lib/http";
import { getAsset, readAssetData } from "@/lib/storage/assets";
import { exportFilename, guideMarkdown, imageAssetIds, type ExportInput } from "./export";
import { getSections, guideUrl, type Guide } from "./service";

type Repository = typeof repositories.$inferSelect;

/** What the Markdown and print exports show: the guide, its sections and its diff snapshot. */
export async function loadGuideExport(guide: Guide, repo: Repository, workspaceSlug: string): Promise<{ data: ExportInput; snapshot: Snapshot }> {
  const [snapshot, sections, pull] = await Promise.all([getSnapshot(guide.snapshotId), getSections(guide.id), getCachedPull(repo.id, guide.prNumber)]);
  if (!snapshot) throw new HttpError(404, "The diff snapshot of this guide is missing");
  const data: ExportInput = {
    guide: {
      title: guide.title,
      version: guide.version,
      status: guide.status,
      summary: guide.summary,
      headSha: guide.headSha,
      author: guide.author,
      createdVia: guide.createdVia,
      createdAt: guide.createdAt,
      template: guide.template,
    },
    repo: { fullName: repo.fullName, htmlUrl: repo.htmlUrl },
    pull: pull
      ? {
          number: pull.number,
          title: pull.title,
          htmlUrl: pull.htmlUrl,
          authorLogin: pull.authorLogin,
          headRef: pull.headRef,
          baseRef: pull.baseRef,
          headSha: pull.headSha,
        }
      : { number: guide.prNumber, title: guide.title, htmlUrl: `${repo.htmlUrl}/pull/${guide.prNumber}`, authorLogin: null, headRef: null, baseRef: null, headSha: null },
    snapshot: { mergeBaseSha: snapshot.mergeBaseSha, truncated: snapshot.truncated },
    files: parseFiles(snapshot.files),
    sections: sections.map((s) => ({ title: s.title, body: s.body, refs: s.refs, generated: s.generated })),
    guideUrl: guideUrl(workspaceSlug, repo.fullName, guide.prNumber, guide.version),
    appUrl: env().APP_URL,
    exportedAt: new Date(),
  };
  return { data, snapshot };
}

/** Embedded images are limited in total; the rest stay links. */
const MAX_EMBED_BYTES = 25 * 1024 * 1024;

/** data: URIs for the uploaded images the guide shows, from its own workspace only. */
async function imageEmbeds(guide: Guide, data: ExportInput): Promise<Map<string, string>> {
  const ids = new Set([data.guide.summary, ...data.sections.map((s) => s.body)].flatMap((md) => imageAssetIds(md, data)));
  const out = new Map<string, string>();
  let total = 0;
  for (const id of ids) {
    const asset = await getAsset(id);
    if (!asset || asset.workspaceId !== guide.workspaceId || !asset.contentType.startsWith("image/")) continue;
    if (total + asset.size > MAX_EMBED_BYTES) continue;
    const bytes = await readAssetData(asset).catch(() => null);
    if (!bytes) continue;
    total += bytes.length;
    out.set(id, `data:${asset.contentType};base64,${bytes.toString("base64")}`);
  }
  return out;
}

/** The guide as a Markdown file, for the viewer's Export menu and the REST API. */
export async function guideMarkdownResponse(guide: Guide, repo: Repository, workspaceSlug: string, opts: { embedImages?: boolean } = {}): Promise<Response> {
  const { data } = await loadGuideExport(guide, repo, workspaceSlug);
  if (opts.embedImages) data.embeds = await imageEmbeds(guide, data);
  return new Response(guideMarkdown(data), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(repo.fullName, guide.prNumber, guide.version)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** `1`, `true`, `yes` or `on`. */
export function flag(value: string | null): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

const VIEW_CONCURRENCY = 6;

/**
 * Highlighted file views for the print layout. With a GitHub connection they include the full
 * file contents (so `expand` refs work); without one, or if it fails, only the patch is shown.
 */
export async function loadFileViews(guide: Guide, snapshot: Snapshot, paths: string[]): Promise<Map<string, FileView>> {
  const repoCtx = await getRepoContext(guide.repositoryId).catch(() => null);
  const shas = { head: snapshot.headSha, mergeBase: snapshot.mergeBaseSha, snapshotId: snapshot.id };
  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const queue = paths.filter((p) => byPath.has(p));
  const out = new Map<string, FileView>();
  const worker = async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      out.set(path, await buildFileView(repoCtx, byPath.get(path)!, shas));
    }
  };
  await Promise.all(Array.from({ length: VIEW_CONCURRENCY }, worker));
  return out;
}
