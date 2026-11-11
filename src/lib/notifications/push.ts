/**
 * Push notifications to the mobile app (mobile/), sent through Expo's push service.
 *
 * The app registers its Expo push token with POST /api/mobile/push-devices. A notification that a
 * member would get by email (same kinds, same workspace mutes) is also pushed right away, without
 * the email's grouping delay, when they have a registered device and push is on in their settings.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushDevices, type NotificationType } from "@/db/schema";
import { env } from "@/lib/env";
import { itemHeadline, type DigestItem } from "./digest";
import type { NotificationData } from "./types";

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
/** Expo accepts up to 100 messages per request. */
const CHUNK = 100;

export function pushEnabled(): boolean {
  return env().NOTIFICATIONS_ENABLED && env().PUSH_NOTIFICATIONS_ENABLED;
}

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN.test(token);
}

export function wantsPush(
  prefs: { push: boolean; guideReady: boolean; newVersion: boolean; replies: boolean; pullActivity: boolean },
  type: NotificationType,
): boolean {
  if (!prefs.push) return false;
  switch (type) {
    case "guide_ready":
      return prefs.guideReady;
    case "new_version":
      return prefs.newVersion;
    case "reply":
      return prefs.replies;
    case "pull_activity":
      return prefs.pullActivity;
  }
}

/** What the app needs to open the right screen when the notification is tapped. */
export type PushData = {
  type: NotificationType;
  workspaceId: string;
  repo: string;
  prNumber: number;
  /** The guide link the email would use (carries `v` and `section`). */
  url: string;
};

export type PushMessage = { title: string; body: string; data: PushData };

/** The text of a push notification: the pull request as the title, what happened as the body. */
export function pushMessage(item: Pick<DigestItem, "type" | "workspaceId" | "prNumber" | "actorName" | "data">): PushMessage {
  const d: NotificationData = item.data;
  const h = itemHeadline({ ...item, id: "", repositoryId: "", createdAt: new Date() });
  const what = [h.actor, h.text, h.code].filter(Boolean).join(" ");
  const quote = d.comment && d.comment.kind !== "review" && d.comment.body.trim() ? `\n“${oneLine(d.comment.body, 140)}”` : "";
  return {
    title: `${d.repo}#${item.prNumber} · ${oneLine(d.prTitle, 80)}`,
    body: `${what}${quote}`,
    data: { type: item.type, workspaceId: item.workspaceId, repo: d.repo, prNumber: item.prNumber, url: d.url },
  };
}

function oneLine(text: string, max: number): string {
  const flat = text
    .replace(/```suggestion[^\n]*\n[\s\S]*?```/g, "[Suggested change]")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/* Devices ------------------------------------------------------------- */

export async function registerPushDevice(userId: string, input: { token: string; platform: "ios" | "android"; deviceName?: string | null }) {
  const values = { userId, token: input.token, platform: input.platform, deviceName: input.deviceName?.slice(0, 100) ?? null, lastSeenAt: new Date() };
  await db
    .insert(pushDevices)
    .values(values)
    .onConflictDoUpdate({ target: pushDevices.token, set: { userId, platform: values.platform, deviceName: values.deviceName, lastSeenAt: values.lastSeenAt } });
}

export async function removePushDevice(userId: string, token: string): Promise<void> {
  await db.delete(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
}

export async function usersWithDevices(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.selectDistinct({ userId: pushDevices.userId }).from(pushDevices).where(inArray(pushDevices.userId, userIds));
  return new Set(rows.map((r) => r.userId));
}

/* Sending ------------------------------------------------------------- */

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };

/**
 * Send one message to every device of a user. Devices Expo reports as no longer registered are
 * removed. Throws when Expo cannot be reached, so the job is retried.
 */
export async function sendPush(userId: string, message: PushMessage, fetchImpl: typeof fetch = fetch): Promise<{ sent: number; removed: number }> {
  const devices = await db.select({ token: pushDevices.token }).from(pushDevices).where(eq(pushDevices.userId, userId));
  if (devices.length === 0) return { sent: 0, removed: 0 };
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const accessToken = env().EXPO_ACCESS_TOKEN;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let sent = 0;
  const gone: string[] = [];
  for (let i = 0; i < devices.length; i += CHUNK) {
    const chunk = devices.slice(i, i + CHUNK);
    const res = await fetchImpl(env().EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk.map((d) => ({ to: d.token, title: message.title, body: message.body, data: message.data, sound: "default" }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
    const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    (json?.data ?? []).forEach((t, n) => {
      if (t.status === "ok") sent++;
      else if (t.details?.error === "DeviceNotRegistered") gone.push(chunk[n].token);
    });
  }
  if (gone.length > 0) await db.delete(pushDevices).where(inArray(pushDevices.token, gone));
  return { sent, removed: gone.length };
}
