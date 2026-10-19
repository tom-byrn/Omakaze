/**
 * Who hears about an event. Pure functions; the database side is in events.ts.
 *
 * Every function leaves out the member who caused the event, and anyone who is not a member of the
 * workspace. Each member gets at most one notification per event, of the most specific kind.
 */
import type { SectionMatch } from "@/lib/guides/carryover";
import type { NotificationData, NotificationType } from "./types";

export type Recipient = { userId: string; type: NotificationType; data: Partial<NotificationData> };

/** A member who reviewed an earlier version: which of the sections they reviewed changed in the new one. */
export type EarlierReviewer = { userId: string; changed: string[]; unchanged: number };

/**
 * Recipients when a guide version is published: members who reviewed an earlier version hear
 * which of their sections changed; requested reviewers and assignees hear that a guide is ready.
 * Logins are GitHub logins already mapped to member IDs.
 */
export function guideRecipients(input: {
  actorUserId: string | null;
  memberIds: ReadonlySet<string>;
  reviewers: EarlierReviewer[];
  requestedUserIds: string[];
  assigneeUserIds: string[];
}): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (userId: string, type: NotificationType, data: Partial<NotificationData>) => {
    if (seen.has(userId) || userId === input.actorUserId || !input.memberIds.has(userId)) return;
    seen.add(userId);
    out.push({ userId, type, data });
  };
  for (const r of input.reviewers) add(r.userId, "new_version", { unchanged: r.unchanged });
  for (const id of input.requestedUserIds) add(id, "guide_ready", { reason: "requested" });
  for (const id of input.assigneeUserIds) add(id, "guide_ready", { reason: "assigned" });
  return out;
}

/**
 * Recipients of a review comment, reply or review: everyone who wrote in the conversation before
 * (the root comment first), and the pull request's author when it was posted in a guide.
 */
export function commentRecipients(input: {
  actorUserId: string | null;
  memberIds: ReadonlySet<string>;
  /** Authors of the conversation's earlier comments, root first; null when they are not members. */
  thread: (string | null)[];
  prAuthorUserId: string | null;
  /** Posted through Omakaze, where the author doesn't otherwise hear about it. */
  viaOmakaze: boolean;
}): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const ok = (id: string | null): id is string => Boolean(id) && id !== input.actorUserId && input.memberIds.has(id!) && !seen.has(id!);
  input.thread.forEach((id, i) => {
    if (!ok(id)) return;
    seen.add(id);
    out.push({ userId: id, type: "reply", data: { comment: { kind: "reply", body: "", path: null, line: null, ownRoot: i === 0 } } });
  });
  if (input.viaOmakaze && ok(input.prAuthorUserId)) {
    seen.add(input.prAuthorUserId);
    out.push({ userId: input.prAuthorUserId, type: "pull_activity", data: {} });
  }
  return out;
}

/** One earlier version as one member saw it: how its sections match the new version, and which they marked. */
export type EarlierVersion = { version: number; matches: Map<string, SectionMatch>; marked: ReadonlySet<string> };

/**
 * Sections of a new version that a member reviewed in an earlier one, split by whether the code
 * they cover changed. `earlier` is newest first; for each new section, the newest version with a
 * mark on the matching section decides (as the viewer's "changed since you reviewed" does).
 * Returns section IDs of the new version.
 */
export function reviewedChanges(earlier: EarlierVersion[]): { changed: string[]; unchanged: string[] } {
  const changed: string[] = [];
  const unchanged: string[] = [];
  const decided = new Set<string>();
  for (const v of earlier) {
    for (const [id, m] of v.matches) {
      if (decided.has(id) || m.status === "new" || !v.marked.has(m.previousId)) continue;
      decided.add(id);
      (m.status === "changed" ? changed : unchanged).push(id);
    }
  }
  return { changed, unchanged };
}

/** Whether a member's preferences let a notification through. */
export function wantsEmail(
  prefs: { email: boolean; guideReady: boolean; newVersion: boolean; replies: boolean; pullActivity: boolean },
  type: NotificationType,
): boolean {
  if (!prefs.email) return false;
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

/** Why email notifications can't reach a user, or null when they can. */
export type EmailBlocker = "instance" | "smtp" | "no_email" | "unverified";

export function emailBlocker(input: { enabled: boolean; smtp: boolean; email: string | null; verified: boolean }): EmailBlocker | null {
  if (!input.enabled) return "instance";
  if (!input.smtp) return "smtp";
  if (!input.email) return "no_email";
  if (!input.verified) return "unverified";
  return null;
}
