/**
 * Notification jobs:
 *
 * - `notify_event`: who hears about one event (hooks.ts queues it). Writes a pending notification
 *   per recipient and queues their email, and queues a post to each Slack or JSON webhook that
 *   wants the event.
 * - `send_notification_email`: one email with all of a recipient's pending notifications. It is
 *   queued for when the first one has waited the recipient's grouping delay, so a burst of events
 *   becomes one email. Preferences and mutes are checked again when it is sent.
 * - `post_notification_webhook`: one message to a Slack or JSON webhook.
 */
import { and, asc, eq, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
  memberships,
  notificationChannels,
  notifications,
  pullRequests,
  repositories,
  sectionReviews,
  users,
  workspaces,
  type EmailDigest,
  type NotificationType,
} from "@/db/schema";
import { env } from "@/lib/env";
import type { GhReviewComment } from "@/lib/github/client";
import { getRepoContext } from "@/lib/github/connections";
import { loginKey, membersAmong, workspaceMembersByLogin, type GitHubMember } from "@/lib/github/people";
import { listReviewComments } from "@/lib/github/review";
import { versionHistory } from "@/lib/guides/progress";
import { getGuide, getLatestGuide, getSections, guidePath, type Section } from "@/lib/guides/service";
import { enqueueJob, type Job } from "@/lib/jobs/queue";
import { deliverMail, mailEnabled } from "@/lib/mail";
import { getChannels, postToChannel, recordDelivery } from "./channels";
import { coalesce, digestDelaySeconds, type DigestItem } from "./digest";
import { renderDigestEmail } from "./email";
import { eventKey, type CommentEvent, type GuidePublishedEvent, type NotifyEvent, type ReviewEvent } from "./hooks";
import {
  getPreferences,
  mutedIn,
  mutedWorkspaces,
  notificationsEnabled,
  oneClickUnsubscribeUrl,
  preferencesFor,
  unsubscribePageUrl,
  unsubscribeToken,
} from "./prefs";
import { commentRecipients, guideRecipients, reviewedChanges, wantsEmail, type EarlierReviewer, type EarlierVersion, type Recipient } from "./recipients";
import { slackMessage, webhookPayload } from "./slack";
import type { ChannelEventData, NotificationData } from "./types";

/** Earlier versions searched for a member's review marks (as the viewer does). */
const REVIEW_LOOKBACK = 5;
/** Pending notifications older than this are dropped instead of sent. */
const MAX_PENDING_DAYS = 7;

export async function runNotificationJob(job: Job): Promise<void> {
  switch (job.type) {
    case "notify_event":
      return handleEvent(job.payload.event as NotifyEvent);
    case "send_notification_email":
      return sendNotificationEmail(String(job.payload.userId));
    case "post_notification_webhook":
      return postNotificationWebhook(String(job.payload.channelId), job.payload.event as ChannelEventData);
  }
}

async function handleEvent(e: NotifyEvent): Promise<void> {
  if (!notificationsEnabled()) return;
  if (e.kind === "guide_published") return guidePublished(e);
  if (e.kind === "comment") return commentPosted(e);
  return reviewSubmitted(e);
}

/* Context ------------------------------------------------------------- */

type PullContext = {
  repo: typeof repositories.$inferSelect;
  ws: typeof workspaces.$inferSelect;
  pull: typeof pullRequests.$inferSelect | null;
  memberIds: Set<string>;
  byLogin: Map<string, GitHubMember>;
};

async function pullContext(repositoryId: string, prNumber: number): Promise<PullContext | null> {
  const [row] = await db
    .select({ repo: repositories, ws: workspaces, pull: pullRequests })
    .from(repositories)
    .innerJoin(workspaces, eq(workspaces.id, repositories.workspaceId))
    .leftJoin(pullRequests, and(eq(pullRequests.repositoryId, repositories.id), eq(pullRequests.number, prNumber)))
    .where(eq(repositories.id, repositoryId))
    .limit(1);
  if (!row) return null;
  const [members, byLogin] = await Promise.all([
    db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.workspaceId, row.ws.id)),
    workspaceMembersByLogin(row.ws.id),
  ]);
  return { ...row, memberIds: new Set(members.map((m) => m.id)), byLogin };
}

function memberByLogin(c: PullContext, login: string | null | undefined): string | null {
  return login ? (c.byLogin.get(loginKey(login))?.userId ?? null) : null;
}

/** A guide link with an optional version and section. */
function guideLink(c: PullContext, prNumber: number, opts: { version?: number; section?: number | null } = {}): string {
  const url = new URL(`${env().APP_URL}${guidePath(c.ws.slug, c.repo.fullName, prNumber)}`);
  if (opts.version) url.searchParams.set("v", String(opts.version));
  if (opts.section) url.searchParams.set("section", String(opts.section));
  return url.toString();
}

function baseData(c: PullContext, prNumber: number, url: string): NotificationData {
  return { workspaceName: c.ws.name, repo: c.repo.fullName, prTitle: c.pull?.title ?? `Pull request #${prNumber}`, url };
}

async function userName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? null;
}

/* Writing notifications ------------------------------------------------ */

async function notifyMembers(input: {
  c: PullContext;
  prNumber: number;
  guideId: string | null;
  key: string;
  actorUserId: string | null;
  actorName: string | null;
  recipients: (Recipient & { data: NotificationData })[];
}): Promise<void> {
  if (input.recipients.length === 0 || !mailEnabled()) return;
  const ids = input.recipients.map((r) => r.userId);
  const [prefs, muted, people] = await Promise.all([
    preferencesFor(ids),
    mutedIn(input.c.ws.id, ids),
    db.select({ id: users.id, email: users.email, verifiedAt: users.emailVerifiedAt }).from(users).where(inArray(users.id, ids)),
  ]);
  // Only confirmed addresses get email.
  const reachable = new Set(people.filter((p) => p.email && p.verifiedAt).map((p) => p.id));
  const rows = input.recipients.filter((r) => reachable.has(r.userId) && !muted.has(r.userId) && wantsEmail(prefs.get(r.userId)!, r.type));
  if (rows.length === 0) return;
  const inserted = await db
    .insert(notifications)
    .values(
      rows.map((r) => ({
        userId: r.userId,
        workspaceId: input.c.ws.id,
        repositoryId: input.c.repo.id,
        prNumber: input.prNumber,
        guideId: input.guideId,
        type: r.type,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        data: r.data,
        eventKey: input.key,
      })),
    )
    .onConflictDoNothing()
    .returning({ userId: notifications.userId });
  for (const { userId } of inserted) await scheduleEmail(userId, prefs.get(userId)!.digest);
}

/** Queue the recipient's email for when their first pending notification has waited long enough. */
async function scheduleEmail(userId: string, digest: EmailDigest, followUp = false): Promise<void> {
  const delay = digestDelaySeconds(digest, env().NOTIFICATIONS_GROUP_SECONDS);
  await enqueueJob(
    "send_notification_email",
    { userId },
    // A queued email already waits for this one too.
    { dedupeKey: `notify-email${followUp ? "-next" : ""}:${userId}`, runAt: new Date(Date.now() + delay * 1000), maxAttempts: 5 },
  );
}

async function notifyChannels(workspaceId: string, event: ChannelEventData): Promise<void> {
  const channels = (await getChannels(workspaceId)).filter((ch) => ch.events.includes(event.event));
  for (const ch of channels) {
    await enqueueJob(
      "post_notification_webhook",
      { channelId: ch.id, event },
      { dedupeKey: `notify-channel:${ch.id}:${event.key}`, oncePerKey: true, maxAttempts: 5 },
    );
  }
}

function channelBase(c: PullContext, prNumber: number, key: string): Omit<ChannelEventData, "event" | "guide" | "actor"> {
  return {
    key,
    workspace: { name: c.ws.name, slug: c.ws.slug, url: `${env().APP_URL}/w/${c.ws.slug}` },
    repository: c.repo.fullName,
    pullRequest: {
      number: prNumber,
      title: c.pull?.title ?? `Pull request #${prNumber}`,
      url: c.pull?.htmlUrl ?? `${c.repo.htmlUrl}/pull/${prNumber}`,
      author: c.pull?.authorLogin ?? null,
    },
    at: new Date().toISOString(),
  };
}

/* A guide version was published ---------------------------------------- */

async function guidePublished(e: GuidePublishedEvent): Promise<void> {
  const guide = await getGuide(e.guideId);
  if (!guide || guide.status !== "ready") return;
  const c = await pullContext(guide.repositoryId, guide.prNumber);
  if (!c) return;
  const sections = await getSections(guide.id);
  const history = versionHistory(guide);
  const earlier = (await history.earlier()).filter((v) => v.status === "ready");
  const previous = earlier[0] ? await getGuide(earlier[0].id) : null;

  // Members who reviewed an earlier version: their marks, and reviews they submitted through Omakaze.
  const lookback = earlier.slice(0, REVIEW_LOOKBACK);
  const marks =
    lookback.length > 0
      ? await db
          .select({ guideId: sectionReviews.guideId, sectionId: sectionReviews.sectionId, userId: sectionReviews.userId })
          .from(sectionReviews)
          .where(inArray(sectionReviews.guideId, lookback.map((v) => v.id)))
      : [];
  const submitted =
    earlier.length > 0
      ? await db
          .selectDistinct({ userId: comments.authorUserId })
          .from(comments)
          .where(and(eq(comments.repositoryId, guide.repositoryId), eq(comments.prNumber, guide.prNumber), eq(comments.kind, "review_submit"), isNotNull(comments.authorUserId)))
      : [];
  const reviewerIds = [...new Set([...marks.map((m) => m.userId), ...submitted.map((s) => s.userId!)])].filter((id) => c.memberIds.has(id) && id !== e.actorUserId);

  const byId = new Map(sections.map((s) => [s.id, s]));
  const sectionLink = (s: Section) => ({ title: s.title, url: guideLink(c, guide.prNumber, { version: guide.version, section: s.position }) });
  const reviewers: EarlierReviewer[] = [];
  const changedFor = new Map<string, NotificationData["changed"]>();
  for (const userId of reviewerIds) {
    const versions: EarlierVersion[] = [];
    for (const v of lookback) {
      const marked = new Set(marks.filter((m) => m.userId === userId && m.guideId === v.id).map((m) => m.sectionId));
      if (marked.size > 0) versions.push({ version: v.version, matches: await history.compare(v), marked });
    }
    const r = reviewedChanges(versions);
    const changed = r.changed.map((id) => byId.get(id)).filter((s): s is Section => Boolean(s)).sort((a, b) => a.position - b.position);
    changedFor.set(userId, changed.map(sectionLink));
    reviewers.push({ userId, changed: changed.map((s) => s.id), unchanged: r.unchanged.length });
  }

  const recipients = guideRecipients({
    actorUserId: e.actorUserId,
    memberIds: c.memberIds,
    reviewers,
    requestedUserIds: membersAmong(c.pull?.requestedReviewers ?? [], c.byLogin).map((m) => m.userId),
    assigneeUserIds: membersAmong(c.pull?.assignees ?? [], c.byLogin).map((m) => m.userId),
  });
  const actorName = (await userName(e.actorUserId)) ?? guide.author ?? null;
  const author = e.actorUserId && guide.author && guide.author !== actorName ? guide.author : null;
  const url = guideLink(c, guide.prNumber, { version: guide.version });
  const pushed = Boolean(previous && previous.headSha !== guide.headSha);
  const key = eventKey(e);
  await notifyMembers({
    c,
    prNumber: guide.prNumber,
    guideId: guide.id,
    key,
    actorUserId: e.actorUserId,
    actorName,
    recipients: recipients.map((r) => ({
      ...r,
      data: {
        ...baseData(c, guide.prNumber, url),
        ...r.data,
        version: guide.version,
        sections: sections.length,
        author,
        ...(r.type === "new_version" ? { pushed, changed: changedFor.get(r.userId) ?? [] } : {}),
      },
    })),
  });

  // Slack and JSON webhooks: what changed compared to the previous version.
  let changed: string[] | undefined;
  let added: number | undefined;
  if (earlier[0]) {
    const matches = await history.compare(earlier[0]);
    changed = sections.filter((s) => matches.get(s.id)?.status === "changed").map((s) => s.title);
    added = sections.filter((s) => matches.get(s.id)?.status === "new").length;
  }
  await notifyChannels(c.ws.id, {
    ...channelBase(c, guide.prNumber, key),
    event: earlier.length > 0 ? "new_version" : "guide_published",
    actor: actorName,
    guide: { version: guide.version, title: guide.title, url, sections: sections.length, author: guide.author, changed, added },
  });
}

/* Comments and replies ------------------------------------------------- */

/** The member behind a comment or review: the one who posted it through Omakaze, or the GitHub login's member. */
async function postedBy(c: PullContext, githubId: number, given: string | null, login: string | null) {
  const [own] = await db
    .select({ authorUserId: comments.authorUserId, sectionId: comments.sectionId })
    .from(comments)
    .where(and(eq(comments.repositoryId, c.repo.id), eq(comments.githubId, githubId)))
    .limit(1);
  const actorUserId = given ?? own?.authorUserId ?? memberByLogin(c, login);
  const actorName = (await userName(actorUserId)) ?? (login ? `@${login}` : null);
  return { actorUserId, actorName, recorded: Boolean(own), sectionId: own?.sectionId ?? null };
}

/**
 * Authors of the conversation's earlier comments, root first, as member IDs (null for people who
 * are not members). Read from GitHub; without a connection, from the comments posted through Omakaze.
 */
async function threadAuthors(c: PullContext, e: CommentEvent): Promise<{ authors: (string | null)[]; rootSectionId: string | null }> {
  const rootId = e.inReplyTo!;
  const recorded = await db
    .select({ githubId: comments.githubId, inReplyTo: comments.inReplyToGithubId, authorUserId: comments.authorUserId, sectionId: comments.sectionId })
    .from(comments)
    .where(and(eq(comments.repositoryId, c.repo.id), eq(comments.prNumber, e.prNumber), or(eq(comments.githubId, rootId), eq(comments.inReplyToGithubId, rootId))));
  const byGithubId = new Map(recorded.map((r) => [r.githubId, r.authorUserId]));
  const rootSectionId = recorded.find((r) => r.githubId === rootId)?.sectionId ?? null;
  let list: GhReviewComment[] | null = null;
  try {
    list = await listReviewComments(await getRepoContext(c.repo.id), e.prNumber, true);
  } catch (err) {
    console.warn("[notifications] review comments unavailable:", err instanceof Error ? err.message : err);
  }
  if (list) {
    const root = list.find((x) => x.id === rootId);
    const replies = list.filter((x) => x.in_reply_to_id === rootId && x.id !== e.commentId).sort((a, b) => a.id - b.id);
    const authors = [root, ...replies]
      .filter((x): x is GhReviewComment => Boolean(x))
      .map((x) => byGithubId.get(x.id) ?? memberByLogin(c, x.user?.login));
    return { authors: root ? authors : [byGithubId.get(rootId) ?? null, ...authors], rootSectionId };
  }
  const replies = recorded.filter((r) => r.inReplyTo === rootId && r.githubId !== e.commentId).map((r) => r.authorUserId);
  return { authors: [byGithubId.get(rootId) ?? null, ...replies], rootSectionId };
}

/** The guide section a comment belongs to: where it was posted, else the first section covering its file. */
async function commentLink(c: PullContext, prNumber: number, path: string | null, sectionId: string | null, fallback: string): Promise<string> {
  const guide = await getLatestGuide(c.repo.id, prNumber, { readyOnly: true });
  if (!guide) return fallback;
  const sections = await getSections(guide.id);
  const covering = (s: Section) => Boolean(path) && s.refs.some((r) => r.path === path);
  const section = sections.find((s) => s.id === sectionId) ?? sections.find((s) => !s.generated && covering(s)) ?? sections.find(covering);
  return guideLink(c, prNumber, { section: section?.position ?? null });
}

async function commentPosted(e: CommentEvent): Promise<void> {
  const c = await pullContext(e.repositoryId, e.prNumber);
  if (!c) return;
  const who = await postedBy(c, e.commentId, e.actorUserId, e.actorLogin);
  const thread = e.inReplyTo ? await threadAuthors(c, e) : { authors: [], rootSectionId: null };
  const recipients = commentRecipients({
    actorUserId: who.actorUserId,
    memberIds: c.memberIds,
    thread: thread.authors,
    prAuthorUserId: memberByLogin(c, c.pull?.authorLogin),
    viaOmakaze: e.via === "omakaze" || who.recorded,
  });
  if (recipients.length === 0) return;
  const url = await commentLink(c, e.prNumber, e.path, e.sectionId ?? who.sectionId ?? thread.rootSectionId, e.url);
  await notifyMembers({
    c,
    prNumber: e.prNumber,
    guideId: null,
    key: eventKey(e),
    actorUserId: who.actorUserId,
    actorName: who.actorName,
    recipients: recipients.map((r) => ({
      ...r,
      data: {
        ...baseData(c, e.prNumber, url),
        comment: { kind: e.inReplyTo ? "reply" : "comment", body: e.body, path: e.path, line: e.line, ownRoot: r.data.comment?.ownRoot },
      },
    })),
  });
}

/* Reviews --------------------------------------------------------------- */

async function reviewSubmitted(e: ReviewEvent): Promise<void> {
  const c = await pullContext(e.repositoryId, e.prNumber);
  if (!c) return;
  const who = await postedBy(c, e.reviewId, e.actorUserId, e.actorLogin);
  const key = eventKey(e);
  const viaOmakaze = e.via === "omakaze" || who.recorded;
  const guide = await getLatestGuide(c.repo.id, e.prNumber, { readyOnly: true });
  const url = guide ? guideLink(c, e.prNumber) : e.url;
  // The author hears about reviews posted in a guide; GitHub tells them about the others.
  const recipients = commentRecipients({ actorUserId: who.actorUserId, memberIds: c.memberIds, thread: [], prAuthorUserId: memberByLogin(c, c.pull?.authorLogin), viaOmakaze });
  await notifyMembers({
    c,
    prNumber: e.prNumber,
    guideId: guide?.id ?? null,
    key,
    actorUserId: who.actorUserId,
    actorName: who.actorName,
    recipients: recipients.map((r) => ({
      ...r,
      data: { ...baseData(c, e.prNumber, url), comment: { kind: "review", body: e.body, path: null, line: null, state: e.state } },
    })),
  });
  // A comment-only review without text is what GitHub records for replies; it isn't a completed review.
  if (e.state === "COMMENTED" && !e.body.trim()) return;
  const sections = guide ? (await getSections(guide.id)).length : 0;
  await notifyChannels(c.ws.id, {
    ...channelBase(c, e.prNumber, key),
    event: "review_submitted",
    actor: who.actorName,
    guide: guide ? { version: guide.version, title: guide.title, url, sections, author: guide.author } : null,
    review: { state: e.state, body: e.body, url: e.url },
  });
}

/* Sending email ---------------------------------------------------------- */

function toItem(n: typeof notifications.$inferSelect): DigestItem {
  return {
    id: n.id,
    type: n.type as NotificationType,
    workspaceId: n.workspaceId,
    repositoryId: n.repositoryId,
    prNumber: n.prNumber,
    actorName: n.actorName,
    data: n.data as NotificationData,
    createdAt: n.createdAt,
  };
}

async function sendNotificationEmail(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Locked until the email is sent, so a second job for the same user can't send them again.
    const pending = await tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.status, "pending")))
      .orderBy(asc(notifications.createdAt))
      .limit(200)
      .for("update", { skipLocked: true });
    if (pending.length === 0) return;
    const skip = async (rows: typeof pending) => {
      if (rows.length > 0) await tx.update(notifications).set({ status: "skipped" }).where(inArray(notifications.id, rows.map((n) => n.id)));
    };
    const [user] = await tx.select({ email: users.email, verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!notificationsEnabled() || !mailEnabled() || !user?.email || !user.verifiedAt) return skip(pending);
    const [prefs, muted, member] = await Promise.all([
      getPreferences(userId),
      mutedWorkspaces(userId),
      tx.select({ id: memberships.workspaceId }).from(memberships).where(eq(memberships.userId, userId)),
    ]);
    const memberOf = new Set(member.map((m) => m.id));
    const cutoff = Date.now() - MAX_PENDING_DAYS * 86_400_000;
    const keep = pending.filter((n) => wantsEmail(prefs, n.type) && !muted.has(n.workspaceId) && memberOf.has(n.workspaceId) && n.createdAt.getTime() > cutoff);
    await skip(pending.filter((n) => !keep.includes(n)));
    if (keep.length === 0) return;

    const token = unsubscribeToken(userId);
    const email = renderDigestEmail(coalesce(keep.map(toItem)), {
      settings: `${env().APP_URL}/account#notifications`,
      unsubscribe: unsubscribePageUrl(token),
      mute: Object.fromEntries([...new Set(keep.map((n) => n.workspaceId))].map((ws) => [ws, unsubscribePageUrl(unsubscribeToken(userId, ws))])),
    });
    await deliverMail({
      to: user.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl(token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
    });
    await tx.update(notifications).set({ status: "sent", sentAt: new Date() }).where(inArray(notifications.id, keep.map((n) => n.id)));
  });

  // Notifications that arrived while this email was being sent get the next one.
  const [left] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.status, "pending")))
    .limit(1);
  if (left) await scheduleEmail(userId, (await getPreferences(userId)).digest, true);
  if (Math.random() < 0.05) {
    await db.delete(notifications).where(and(ne(notifications.status, "pending"), lt(notifications.createdAt, new Date(Date.now() - 30 * 86_400_000))));
  }
}

/* Slack and JSON webhooks ------------------------------------------------ */

async function postNotificationWebhook(channelId: string, event: ChannelEventData): Promise<void> {
  if (!notificationsEnabled()) return;
  const [ch] = await db.select().from(notificationChannels).where(eq(notificationChannels.id, channelId)).limit(1);
  if (!ch || !ch.events.includes(event.event)) return;
  const res = await postToChannel(ch, { slack: slackMessage(event), json: webhookPayload(event), event: event.event });
  await recordDelivery(ch.id, res.ok ? null : res.error);
  // A refusal (a removed Slack webhook, a 404) won't change by trying again; the settings show it.
  if (!res.ok && res.retry) throw new Error(`${ch.kind === "slack" ? "Slack" : "Webhook"}: ${res.error}`);
}
