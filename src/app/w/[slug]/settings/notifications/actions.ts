"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/ui/ActionForm";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { ChannelError, getChannel, removeChannel, saveChannel, sendTestMessage, type ChannelKind } from "@/lib/notifications/channels";
import { setWorkspaceMuted } from "@/lib/notifications/prefs";
import { CHANNEL_EVENTS, type ChannelEvent } from "@/lib/notifications/types";
import { assertWorkspaceRole, getWorkspaceBySlug } from "@/lib/workspaces";

async function context(slug: string, minRole: "member" | "admin") {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) throw new Error("Workspace not found");
  await assertWorkspaceRole(ws.id, user.id, minRole);
  return { user, ws };
}

const NAMES: Record<ChannelKind, string> = { slack: "Slack", webhook: "The webhook" };

/** Save, test or remove the workspace's Slack or JSON webhook (the button's `intent`). */
export async function saveChannelAction(slug: string, kind: ChannelKind, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await context(slug, "admin");
    const intent = String(form.get("intent") ?? "save");
    const url = String(form.get("url") ?? "").trim() || null;
    const events = form.getAll("events").map(String).filter((e): e is ChannelEvent => CHANNEL_EVENTS.includes(e as ChannelEvent));
    if (intent === "remove") {
      await removeChannel(ws.id, kind);
      await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "notifications", channel: kind, removed: true } });
      revalidatePath(`/w/${ws.slug}/settings/notifications`);
      return { ok: true, message: `${kind === "slack" ? "Slack webhook" : "Webhook"} removed.` };
    }
    if (intent === "test") {
      const res = await sendTestMessage({ kind, url, channel: await getChannel(ws.id, kind), workspace: ws, sentBy: user.name, events });
      return res.ok ? { ok: true, message: `Test message sent (HTTP ${res.status}).` } : { error: `${NAMES[kind]} didn't accept the test message: ${res.error}` };
    }
    await saveChannel(ws.id, kind, { url, events, userId: user.id });
    await logActivity({ workspaceId: ws.id, type: "settings.updated", actorUserId: user.id, data: { section: "notifications", channel: kind, events } });
    revalidatePath(`/w/${ws.slug}/settings/notifications`);
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (err instanceof ChannelError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

/** A member's own email about this workspace (the mute). */
export async function saveWorkspaceEmailAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { user, ws } = await context(slug, "member");
    const on = form.get("email") === "on";
    await setWorkspaceMuted(user.id, ws.id, !on);
    revalidatePath(`/w/${ws.slug}/settings/notifications`);
    return { ok: true, message: on ? `You get email about ${ws.name}.` : `Muted. You won't get email about ${ws.name}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong" };
  }
}
