"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { createWorkspace } from "@/lib/workspaces";

export async function createWorkspaceAction(_prev: { error?: string } | undefined, form: FormData) {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name" };
  const ws = await createWorkspace({ name, userId: user.id });
  await logActivity({ workspaceId: ws.id, type: "workspace.created", actorUserId: user.id, data: { name } });
  redirect(`/w/${ws.slug}/settings/github`);
}
