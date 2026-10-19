"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { repositories, workspaces } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { describeOutline, MAX_INSTRUCTIONS, outlineSchema, type TemplateOutline } from "@/lib/guides/templates";
import { assertWorkspaceRole, getWorkspaceBySlug } from "@/lib/workspaces";

async function adminContext(slug: string) {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) throw new Error("Workspace not found");
  await assertWorkspaceRole(ws.id, user.id, "admin");
  return { user, ws };
}

/** The outline that TemplateEditor posts as JSON. */
function readOutline(form: FormData): { outline: TemplateOutline } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("outline") ?? ""));
  } catch {
    return { error: "The outline could not be read. Reload the page and try again." };
  }
  const parsed = outlineSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "The outline is not valid." };
  const { name, sections } = parsed.data;
  return { outline: { name: sections.length > 0 ? name || "Custom" : "", sections } };
}

function readInstructions(form: FormData): string {
  return String(form.get("instructions") ?? "").trim().slice(0, MAX_INSTRUCTIONS);
}

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "Something went wrong" };
}

/** Workspace outline and writing instructions (the existing `ai_instructions`). */
export async function saveWorkspaceTemplateAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await adminContext(slug);
    const read = readOutline(form);
    if ("error" in read) return { error: read.error };
    const instructions = readInstructions(form);
    await db
      .update(workspaces)
      .set({ guideTemplate: read.outline.sections.length > 0 ? read.outline : null, aiInstructions: instructions || null })
      .where(eq(workspaces.id, ws.id));
    await logActivity({
      workspaceId: ws.id,
      type: "settings.updated",
      actorUserId: user.id,
      data: { section: "guide template", template: describeOutline(read.outline) },
    });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return { ok: true, message: "Saved. New guides use this template." };
  } catch (err) {
    return fail(err);
  }
}

/** A repository's own outline (or the workspace's) and its additional instructions. */
export async function saveRepoTemplateAction(slug: string, repositoryId: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await adminContext(slug);
    let outline: TemplateOutline | null = null;
    if (form.get("outlineMode") === "own") {
      const read = readOutline(form);
      if ("error" in read) return { error: read.error };
      outline = read.outline;
    }
    const instructions = readInstructions(form);
    const [repo] = await db
      .update(repositories)
      .set({ guideTemplate: outline || instructions ? { outline, instructions } : null })
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, ws.id)))
      .returning({ id: repositories.id, fullName: repositories.fullName });
    if (!repo) return { error: "Repository not found" };
    await logActivity({
      workspaceId: ws.id,
      type: "settings.updated",
      actorUserId: user.id,
      repositoryId: repo.id,
      data: { section: `${repo.fullName} guide template`, template: outline ? describeOutline(outline) : "workspace" },
    });
    revalidatePath(`/w/${ws.slug}`, "layout");
    return { ok: true, message: "Saved. New guides in this repository use this template." };
  } catch (err) {
    return fail(err);
  }
}
