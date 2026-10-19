/** Email notification preferences, workspace mutes, unsubscribe links and confirming an address. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, notificationMutes, notificationPreferences } from "@/db/schema";
import { signPayload, verifyPayload } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/http";
import { mailEnabled, sendMail } from "@/lib/mail";
import { digestDelaySeconds } from "./digest";
import { emailBlocker, type EmailBlocker } from "./recipients";

export type Preferences = Omit<typeof notificationPreferences.$inferSelect, "userId" | "updatedAt">;

export const DEFAULT_PREFERENCES: Preferences = {
  email: true,
  guideReady: true,
  newVersion: true,
  replies: true,
  pullActivity: true,
  digest: "minutes",
};

/** The instance switch (NOTIFICATIONS_ENABLED) for email, Slack and JSON webhooks. */
export function notificationsEnabled(): boolean {
  return env().NOTIFICATIONS_ENABLED;
}

function strip(row: typeof notificationPreferences.$inferSelect): Preferences {
  const { userId: _u, updatedAt: _t, ...prefs } = row;
  void _u;
  void _t;
  return prefs;
}

export async function getPreferences(userId: string): Promise<Preferences> {
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return row ? strip(row) : { ...DEFAULT_PREFERENCES };
}

export async function preferencesFor(userIds: string[]): Promise<Map<string, Preferences>> {
  const out = new Map<string, Preferences>(userIds.map((id) => [id, { ...DEFAULT_PREFERENCES }]));
  if (userIds.length === 0) return out;
  for (const row of await db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds))) {
    out.set(row.userId, strip(row));
  }
  return out;
}

export async function savePreferences(userId: string, prefs: Preferences): Promise<void> {
  await db
    .insert(notificationPreferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...prefs, updatedAt: new Date() } });
  // A shorter delay also applies to the email that is already waiting.
  const delay = digestDelaySeconds(prefs.digest, env().NOTIFICATIONS_GROUP_SECONDS);
  await db
    .update(jobs)
    .set({ runAt: sql`least(${jobs.runAt}, now() + make_interval(secs => ${delay}))` })
    .where(and(eq(jobs.type, "send_notification_email"), eq(jobs.status, "queued"), eq(jobs.dedupeKey, `notify-email:${userId}`)));
}

export async function mutedWorkspaces(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: notificationMutes.workspaceId }).from(notificationMutes).where(eq(notificationMutes.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/** Members of a workspace who muted it. */
export async function mutedIn(workspaceId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ id: notificationMutes.userId })
    .from(notificationMutes)
    .where(and(eq(notificationMutes.workspaceId, workspaceId), inArray(notificationMutes.userId, userIds)));
  return new Set(rows.map((r) => r.id));
}

export async function setWorkspaceMuted(userId: string, workspaceId: string, muted: boolean): Promise<void> {
  if (muted) await db.insert(notificationMutes).values({ userId, workspaceId }).onConflictDoNothing();
  else await db.delete(notificationMutes).where(and(eq(notificationMutes.userId, userId), eq(notificationMutes.workspaceId, workspaceId)));
}

/** Why email notifications can't reach this user right now, or null. */
export function emailBlockerFor(user: { email: string | null; emailVerifiedAt: Date | null }): EmailBlocker | null {
  return emailBlocker({ enabled: notificationsEnabled(), smtp: mailEnabled(), email: user.email, verified: Boolean(user.emailVerifiedAt) });
}

/* Unsubscribe links --------------------------------------------------- */

const UNSUBSCRIBE_PURPOSE = "notifications-unsubscribe";
/** Links in old emails keep working for a year. */
const UNSUBSCRIBE_TTL = 365 * 24 * 60 * 60;

export type UnsubscribeScope = { uid: string; ws?: string };

export function unsubscribeToken(userId: string, workspaceId?: string): string {
  return signPayload(workspaceId ? { uid: userId, ws: workspaceId } : { uid: userId }, UNSUBSCRIBE_PURPOSE, UNSUBSCRIBE_TTL);
}

export function readUnsubscribeToken(token: string | null | undefined): UnsubscribeScope | null {
  const data = verifyPayload<{ uid?: unknown; ws?: unknown }>(token, UNSUBSCRIBE_PURPOSE);
  if (!data || typeof data.uid !== "string") return null;
  return typeof data.ws === "string" ? { uid: data.uid, ws: data.ws } : { uid: data.uid };
}

/** The page the link in an email opens: it asks before unsubscribing, so link scanners can't. */
export function unsubscribePageUrl(token: string): string {
  return `${env().APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** The List-Unsubscribe URL mail clients POST to (RFC 8058 one-click). */
export function oneClickUnsubscribeUrl(token: string): string {
  return `${env().APP_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Turn notification email off, for everything or for one workspace. */
export async function applyUnsubscribe(scope: UnsubscribeScope): Promise<void> {
  if (scope.ws) {
    await setWorkspaceMuted(scope.uid, scope.ws, true);
    return;
  }
  const prefs = await getPreferences(scope.uid);
  await savePreferences(scope.uid, { ...prefs, email: false });
}

/* Confirming an address ----------------------------------------------- */

export const EMAIL_CONFIRM_PURPOSE = "notifications-email";

export class ConfirmEmailError extends Error {}

/** Email a link that confirms the user's address (valid 24 hours, for the same signed-in user). */
export async function sendEmailConfirmation(user: { id: string; email: string | null }): Promise<void> {
  if (!user.email) throw new ConfirmEmailError("Add an email address first.");
  if (!mailEnabled()) throw new ConfirmEmailError("This instance can't send email.");
  if (!rateLimit(`email-confirm:${user.id}`, 3, 60 * 60 * 1000)) {
    throw new ConfirmEmailError("We already sent confirmation links. Use the latest one, or try again in an hour.");
  }
  const sig = signPayload({ uid: user.id, email: user.email.toLowerCase() }, EMAIL_CONFIRM_PURPOSE, 24 * 60 * 60);
  const link = `${env().APP_URL}/account/confirm-email?sig=${encodeURIComponent(sig)}`;
  const sent = await sendMail({
    to: user.email,
    subject: "Confirm your email address for Omakaze",
    text: `Open this link to confirm ${user.email} and get email notifications from Omakaze:\n\n${link}\n\nThe link expires in 24 hours. If you didn't ask for it, ignore this email.`,
  });
  if (!sent) throw new ConfirmEmailError(`We couldn't send a confirmation link to ${user.email}. Try again later.`);
}
