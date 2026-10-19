import type { ChannelEvent, NotificationType } from "@/db/schema";

export type { ChannelEvent, EmailDigest, NotificationType } from "@/db/schema";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";

/** What an email shows for one notification (`notifications.data`). */
export type NotificationData = {
  workspaceName: string;
  repo: string;
  prTitle: string;
  /** The guide (a section of it when known), or the pull request on GitHub when there is no guide. */
  url: string;
  /** guide_ready and new_version */
  version?: number;
  sections?: number;
  /** Who wrote the guide when that is not the actor (an agent or the AI model). */
  author?: string | null;
  /** guide_ready: why the recipient hears about it. */
  reason?: "requested" | "assigned";
  /** new_version: the head commit changed since the previous version. */
  pushed?: boolean;
  /** new_version: sections the recipient reviewed in an earlier version whose code changed, with links. */
  changed?: { title: string; url: string }[];
  /** new_version: sections the recipient reviewed whose code did not change (their marks carried over). */
  unchanged?: number;
  /** reply and pull_activity */
  comment?: {
    kind: "comment" | "reply" | "review";
    body: string;
    path: string | null;
    line: number | null;
    state?: ReviewState;
    /** reply: the conversation was started by the recipient. */
    ownRoot?: boolean;
  };
};

/** A workspace event as Slack and JSON webhooks receive it. */
export type ChannelEventData = {
  event: ChannelEvent;
  /** Identifies the event, so a retried or duplicate delivery is not posted twice. */
  key: string;
  workspace: { name: string; slug: string; url: string };
  repository: string;
  pullRequest: { number: number; title: string; url: string; author: string | null };
  guide: {
    version: number;
    title: string;
    url: string;
    sections: number;
    author: string | null;
    /** new_version: sections whose code changed compared to the previous version. */
    changed?: string[];
    /** new_version: sections that are new compared to the previous version. */
    added?: number;
  } | null;
  /** Who caused the event: a member's name, a GitHub login or the AI model. */
  actor: string | null;
  review?: { state: ReviewState; body: string; url: string };
  at: string;
};

export const NOTIFICATION_TYPES: NotificationType[] = ["guide_ready", "new_version", "reply", "pull_activity"];
export const CHANNEL_EVENTS: ChannelEvent[] = ["guide_published", "new_version", "review_submitted"];

export const CHANNEL_EVENT_LABELS: Record<ChannelEvent, { label: string; help: string }> = {
  guide_published: { label: "Guide published", help: "The first guide for a pull request is ready." },
  new_version: { label: "New version", help: "A new version of a guide is published, usually after new commits." },
  review_submitted: { label: "Review completed", help: "A member approves, requests changes or comments with a review." },
};
