/**
 * What the rest of the app calls when something happens that members may hear about. Each call
 * only queues a `notify_event` job (jobs.ts works out the recipients), never throws, and is
 * de-duplicated per event, so a comment posted through Omakaze and its webhook from GitHub are
 * one event.
 */
import { enqueueJob } from "@/lib/jobs/queue";
import { notificationsEnabled } from "./prefs";
import type { ReviewState } from "./types";

export type GuidePublishedEvent = { kind: "guide_published"; guideId: string; actorUserId: string | null };

export type CommentEvent = {
  kind: "comment";
  repositoryId: string;
  prNumber: number;
  /** GitHub ID of the review comment. */
  commentId: number;
  /** The conversation's root comment, for replies. */
  inReplyTo: number | null;
  actorUserId: string | null;
  actorLogin: string | null;
  body: string;
  path: string | null;
  line: number | null;
  /** The comment on GitHub. */
  url: string;
  sectionId: string | null;
  via: "omakaze" | "github";
  /** A comment on the pull request's conversation (an issue comment) rather than on the code. */
  conversation?: boolean;
};

export type ReviewEvent = {
  kind: "review";
  repositoryId: string;
  prNumber: number;
  reviewId: number;
  state: ReviewState;
  body: string;
  url: string;
  actorUserId: string | null;
  actorLogin: string | null;
  via: "omakaze" | "github";
};

export type NotifyEvent = GuidePublishedEvent | CommentEvent | ReviewEvent;

export function eventKey(e: NotifyEvent): string {
  if (e.kind === "guide_published") return `guide:${e.guideId}`;
  // Issue comments and review comments are numbered separately on GitHub.
  if (e.kind === "comment") return `${e.conversation ? "issue-comment" : "comment"}:${e.repositoryId}:${e.commentId}`;
  return `review:${e.repositoryId}:${e.reviewId}`;
}

async function queue(event: NotifyEvent): Promise<void> {
  if (!notificationsEnabled()) return;
  try {
    await enqueueJob("notify_event", { event }, { dedupeKey: `notify:${eventKey(event)}`, oncePerKey: true, maxAttempts: 3 });
  } catch (err) {
    console.error("[notifications] could not queue", eventKey(event), err instanceof Error ? err.message : err);
  }
}

/** A guide version was published for the first time (publishing it again tells nobody). */
export function notifyGuidePublished(guideId: string, actorUserId: string | null): Promise<void> {
  return queue({ kind: "guide_published", guideId, actorUserId });
}

export function notifyComment(e: Omit<CommentEvent, "kind">): Promise<void> {
  return queue({ kind: "comment", ...e });
}

export function notifyReview(e: Omit<ReviewEvent, "kind" | "state"> & { state: string }): Promise<void> {
  const state = e.state.toUpperCase();
  if (state !== "APPROVED" && state !== "CHANGES_REQUESTED" && state !== "COMMENTED") return Promise.resolve();
  return queue({ kind: "review", ...e, state });
}

type GhUserRef = { login: string } | null | undefined;

export type NotifyWebhookPayload = {
  action?: string;
  pull_request?: { number: number };
  comment?: { id: number; in_reply_to_id?: number; body: string; path: string; line: number | null; original_line?: number | null; html_url: string; user: GhUserRef };
  review?: { id: number; state: string; body: string | null; html_url: string; user: GhUserRef };
};

/**
 * Webhooks from GitHub: replies to review comments (`pull_request_review_comment` created) and
 * submitted reviews (`pull_request_review` submitted). Comments that start a conversation on GitHub
 * notify nobody; GitHub tells the pull request's author itself.
 */
export async function notifyFromWebhook(event: string, payload: NotifyWebhookPayload, repositoryId: string): Promise<void> {
  const prNumber = payload.pull_request?.number;
  if (!prNumber) return;
  if (event === "pull_request_review_comment" && payload.action === "created" && payload.comment?.in_reply_to_id) {
    const c = payload.comment;
    await notifyComment({
      repositoryId,
      prNumber,
      commentId: c.id,
      inReplyTo: c.in_reply_to_id ?? null,
      actorUserId: null,
      actorLogin: c.user?.login ?? null,
      body: c.body,
      path: c.path,
      line: c.line ?? c.original_line ?? null,
      url: c.html_url,
      sectionId: null,
      via: "github",
    });
  }
  if (event === "pull_request_review" && payload.action === "submitted" && payload.review) {
    const r = payload.review;
    await notifyReview({
      repositoryId,
      prNumber,
      reviewId: r.id,
      state: r.state,
      body: r.body ?? "",
      url: r.html_url,
      actorUserId: null,
      actorLogin: r.user?.login ?? null,
      via: "github",
    });
  }
}
