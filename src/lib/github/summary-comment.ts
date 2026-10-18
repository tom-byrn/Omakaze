import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pullRequests, repositories, workspaces } from "@/db/schema";
import { getRepoContext } from "@/lib/github/connections";
import { gh } from "@/lib/github/client";
import { getGuide, getSections, guideUrl } from "@/lib/guides/service";
import { shortSha } from "@/lib/format";

const MARKER = "<!-- guided-prs:summary -->";

/** Replace diff: links (only meaningful inside Guided PRs) with their label. */
export function stripDiffLinks(md: string): string {
  return md.replace(/\[([^\]]+)\]\(diff:[^)]*\)/g, "$1");
}

function firstParagraphs(md: string, maxChars = 900): string {
  const text = stripDiffLinks(md).replace(/```mermaid[\s\S]*?```/g, "").trim();
  const paras = text.split(/\n{2,}/).filter((p) => !p.startsWith("#"));
  let out = "";
  for (const p of paras) {
    if ((out + p).length > maxChars) break;
    out += (out ? "\n\n" : "") + p;
  }
  return out || text.slice(0, maxChars);
}

/** Create or update the PR comment that links to the latest guide. */
export async function postGuideSummaryComment(guideId: string): Promise<void> {
  const guide = await getGuide(guideId);
  if (!guide || guide.status !== "ready") return;
  const ctx = await getRepoContext(guide.repositoryId);
  const [ws] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .innerJoin(repositories, eq(repositories.workspaceId, workspaces.id))
    .where(eq(repositories.id, guide.repositoryId))
    .limit(1);
  const sections = await getSections(guide.id);
  const url = guideUrl(ws.slug, ctx.repo.fullName, guide.prNumber);
  const rows = sections.map((s, i) => {
    const files = new Set(s.refs.map((r) => r.path)).size;
    return `| ${String(i + 1).padStart(2, "0")} | [${s.title.replace(/\|/g, "\\|")}](${url}?section=${i + 1}) | ${files} |`;
  });
  const body = [
    `### Guided walkthrough`,
    "",
    firstParagraphs(guide.summary),
    "",
    "| # | Section | Files |",
    "|---|---|---|",
    ...rows,
    "",
    `**[Open the guided walkthrough →](${url})**`,
    "",
    `<sub>Guided PRs · version ${guide.version} · ${shortSha(guide.headSha)}</sub>`,
    MARKER,
  ].join("\n");

  const [pull] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repositoryId, guide.repositoryId), eq(pullRequests.number, guide.prNumber)))
    .limit(1);
  const { owner, name } = ctx.repo;
  if (pull?.summaryCommentId) {
    try {
      await gh(ctx.token, `/repos/${owner}/${name}/issues/comments/${pull.summaryCommentId}`, {
        method: "PATCH",
        body: { body },
      });
      return;
    } catch {
      // comment deleted; create a new one
    }
  }
  const created = await gh<{ id: number }>(ctx.token, `/repos/${owner}/${name}/issues/${guide.prNumber}/comments`, {
    method: "POST",
    body: { body },
  });
  if (pull) await db.update(pullRequests).set({ summaryCommentId: created.id }).where(eq(pullRequests.id, pull.id));
}
