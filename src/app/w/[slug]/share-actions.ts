"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { repositories, workspaces } from "@/db/schema";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getGuide, guidePath } from "@/lib/guides/service";
import { createShareLink, revokeShareLink, ShareError } from "@/lib/share/links";
import { SHARE_EXPIRY_VALUES } from "@/lib/share/options";
import { canCreateShareLinks } from "@/lib/share/policy";
import { assertWorkspaceRole, getWorkspaceBySlug } from "@/lib/workspaces";

async function ctx(slug: string, minRole: "member" | "admin") {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) throw new Error("Workspace not found");
  const role = await assertWorkspaceRole(ws.id, user.id, minRole);
  return { user, ws, role };
}

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "Something went wrong" };
}

/** Pages that list share links. */
async function revalidateLists(slug: string, repositoryId: string, prNumber: number) {
  const [repo] = await db.select({ fullName: repositories.fullName }).from(repositories).where(eq(repositories.id, repositoryId));
  if (repo) revalidatePath(guidePath(slug, repo.fullName, prNumber));
  revalidatePath(`/w/${slug}/settings/sharing`);
}

const createSchema = z.object({
  target: z.enum(["version", "latest"]),
  expires: z.enum(SHARE_EXPIRY_VALUES),
  comments: z.literal("on").optional(),
});

export async function createShareLinkAction(slug: string, guideId: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws, role } = await ctx(slug, "member");
    if (!env().SHARE_LINKS_ENABLED) return { error: "Share links are turned off on this instance." };
    if (!ws.shareLinksEnabled) return { error: "Share links are turned off in this workspace." };
    if (!canCreateShareLinks(role, ws.shareLinkRole)) return { error: "Only admins and owners can create share links in this workspace." };
    const parsed = createSchema.safeParse({
      target: form.get("target"),
      expires: form.get("expires"),
      comments: form.get("comments") ?? undefined,
    });
    if (!parsed.success) return { error: "Choose what to share and when the link expires." };
    const guide = await getGuide(guideId);
    if (!guide || guide.workspaceId !== ws.id) return { error: "Guide not found." };
    const { url } = await createShareLink({
      workspaceId: ws.id,
      guide,
      latest: parsed.data.target === "latest",
      expires: parsed.data.expires,
      includeComments: parsed.data.comments === "on",
      userId: user.id,
    });
    await revalidateLists(slug, guide.repositoryId, guide.prNumber);
    return { ok: true, message: "Link created. Copy it now; it isn't shown again.", data: { url } };
  } catch (err) {
    if (err instanceof ShareError) return { error: err.message };
    return fail(err);
  }
}

export async function revokeShareLinkAction(slug: string, linkId: string): Promise<FormState> {
  try {
    const { user, ws, role } = await ctx(slug, "member");
    const link = await revokeShareLink(ws.id, linkId, { userId: user.id, role });
    await revalidateLists(slug, link.repositoryId, link.prNumber);
    return { ok: true };
  } catch (err) {
    if (err instanceof ShareError) return { error: err.message };
    return fail(err);
  }
}

export async function saveShareSettingsAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await ctx(slug, "admin");
    const values = {
      shareLinksEnabled: form.get("shareLinksEnabled") === "on",
      shareLinkRole: form.get("shareLinkRole") === "member" ? ("member" as const) : ("admin" as const),
    };
    await db.update(workspaces).set(values).where(eq(workspaces.id, ws.id));
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "share link", ...values } });
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return fail(err);
  }
}
