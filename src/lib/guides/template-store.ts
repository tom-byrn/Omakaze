import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guideSections, workspaces, type guides, type repositories } from "@/db/schema";
import { missingRequired, quoteTitles, resolveTemplate, type ResolvedTemplate, type TemplateSection } from "./templates";

type Repository = typeof repositories.$inferSelect;
type GuideRow = typeof guides.$inferSelect;

/** The guide template in effect for a repository of a workspace (or the workspace's, without one). */
export async function templateFor(workspaceId: string, repo: Pick<Repository, "guideTemplate"> | null): Promise<ResolvedTemplate | null> {
  const [ws] = await db
    .select({ guideTemplate: workspaces.guideTemplate, aiInstructions: workspaces.aiInstructions })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return ws ? resolveTemplate(ws, repo) : null;
}

/** Required template sections a guide does not have yet, judged by the template it was started with. */
export async function missingRequiredSections(guide: Pick<GuideRow, "id" | "template">): Promise<TemplateSection[]> {
  if (!guide.template || guide.template.sections.length === 0) return [];
  const sections = await db
    .select({ title: guideSections.title, body: guideSections.body, refs: guideSections.refs, generated: guideSections.generated })
    .from(guideSections)
    .where(eq(guideSections.guideId, guide.id));
  return missingRequired(guide.template, sections);
}

/** Warning for MCP results. Empty when nothing is missing; it never fails the call. */
export async function templateWarning(guide: Pick<GuideRow, "id" | "template">): Promise<string> {
  const missing = await missingRequiredSections(guide);
  if (missing.length === 0) return "";
  return [
    `Template warning: the "${guide.template!.name}" template requires ${quoteTitles(missing)}, which ${missing.length === 1 ? "is" : "are"} missing.`,
    ...missing.map((s) => `- ${s.title}${s.guidance ? `: ${s.guidance}` : ""}`),
    "Add them with add_section, then call finish_guide again.",
  ].join("\n");
}
