/**
 * Grouping pending notifications into one email: one group per pull request, newer guide versions
 * replacing older ones, and the wording of subjects and lines. Pure functions.
 */
import type { EmailDigest, NotificationType } from "@/db/schema";
import type { NotificationData } from "./types";

export const DIGEST_OPTIONS: { value: EmailDigest; label: string; help: string }[] = [
  { value: "minutes", label: "Within a few minutes", help: "Notifications that arrive close together are sent as one email." },
  { value: "hourly", label: "At most once an hour", help: "One email with everything from the hour." },
  { value: "daily", label: "At most once a day", help: "One email with everything from the day." },
];

/** How long the first pending notification waits before the email goes out. */
export function digestDelaySeconds(digest: EmailDigest, groupSeconds: number): number {
  if (digest === "hourly") return 3600;
  if (digest === "daily") return 86_400;
  return groupSeconds;
}

export type DigestItem = {
  id: string;
  type: NotificationType;
  workspaceId: string;
  repositoryId: string;
  prNumber: number;
  actorName: string | null;
  data: NotificationData;
  createdAt: Date;
};

export type DigestGroup = {
  workspaceId: string;
  workspaceName: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  /** Where "Open the guide" goes: the newest guide version mentioned, else the first item's link. */
  url: string;
  items: DigestItem[];
};

const isGuide = (t: NotificationType) => t === "guide_ready" || t === "new_version";

/**
 * One group per pull request, in the order of their first notification. Of several notifications
 * about guide versions of one pull request only the newest version is kept; comments are all kept.
 */
export function coalesce(items: DigestItem[]): DigestGroup[] {
  const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const groups = new Map<string, DigestGroup>();
  for (const item of sorted) {
    const key = `${item.workspaceId}:${item.repositoryId}:${item.prNumber}`;
    let g = groups.get(key);
    if (!g) {
      g = { workspaceId: item.workspaceId, workspaceName: item.data.workspaceName, repo: item.data.repo, prNumber: item.prNumber, prTitle: item.data.prTitle, url: item.data.url, items: [] };
      groups.set(key, g);
    }
    g.prTitle = item.data.prTitle;
    if (isGuide(item.type)) {
      const i = g.items.findIndex((x) => isGuide(x.type));
      if (i >= 0) {
        if ((g.items[i].data.version ?? 0) > (item.data.version ?? 0)) continue;
        g.items.splice(i, 1);
      }
      g.items.push(item);
    } else {
      g.items.push(item);
    }
  }
  for (const g of groups.values()) {
    const guide = g.items.find((x) => isGuide(x.type));
    g.url = guide ? guide.data.url : g.items[0].data.url;
    // The guide first: it says what the rest of the pull request's news is about.
    g.items.sort((a, b) => Number(isGuide(b.type)) - Number(isGuide(a.type)));
  }
  return [...groups.values()];
}

function prLabel(g: { prNumber: number; prTitle: string }): string {
  return `#${g.prNumber} ${g.prTitle}`;
}

function reviewVerb(state: string | undefined): string {
  if (state === "APPROVED") return "approved";
  if (state === "CHANGES_REQUESTED") return "requested changes on";
  return "reviewed";
}

function itemSubject(item: DigestItem, g: DigestGroup): string {
  const actor = item.actorName ?? "Someone";
  const d = item.data;
  switch (item.type) {
    case "guide_ready":
      return `Guide ready to review: ${prLabel(g)}`;
    case "new_version": {
      const n = d.changed?.length ?? 0;
      return `Version ${d.version} of ${prLabel(g)}${n > 0 ? `: ${n === 1 ? "1 section" : `${n} sections`} you reviewed changed` : ""}`;
    }
    case "reply":
      return d.comment?.ownRoot ? `${actor} replied to your comment on #${g.prNumber}` : `${actor} replied on #${g.prNumber} ${g.prTitle}`;
    case "pull_activity":
      if (d.comment?.kind === "review") return `${actor} ${reviewVerb(d.comment.state)} ${prLabel(g)}`;
      return `${actor} ${d.comment?.kind === "reply" ? "replied on" : "commented on"} ${prLabel(g)}`;
  }
}

export function digestSubject(groups: DigestGroup[]): string {
  const items = groups.flatMap((g) => g.items);
  if (items.length === 1) return itemSubject(items[0], groups[0]);
  if (groups.length === 1) return `${items.length} updates on ${prLabel(groups[0])}`;
  const workspaces = new Set(groups.map((g) => g.workspaceName));
  return `${items.length} updates on ${groups.length} pull requests${workspaces.size === 1 ? ` in ${groups[0].workspaceName}` : ""}`;
}

/** The line describing a notification: the actor (shown in bold) and what they did. */
export function itemHeadline(item: DigestItem): { actor: string | null; text: string; code?: string } {
  const d = item.data;
  const c = d.comment;
  const where = c?.path ? `${c.path}${c.line ? `:${c.line}` : ""}` : undefined;
  switch (item.type) {
    case "guide_ready": {
      const what = d.version && d.version > 1 ? `published version ${d.version} of the guide` : "published a guide";
      const count = d.sections ? ` with ${d.sections === 1 ? "1 section" : `${d.sections} sections`}` : "";
      const why = d.reason === "assigned" ? "You're assigned to this pull request." : "Your review is requested.";
      return item.actorName ? { actor: item.actorName, text: `${what}${count}. ${why}` } : { actor: null, text: `A guide is ready${count}. ${why}` };
    }
    case "new_version": {
      const after = d.pushed ? " after new commits" : "";
      return item.actorName
        ? { actor: item.actorName, text: `published version ${d.version} of the guide${after}.` }
        : { actor: null, text: `Version ${d.version} of the guide was published${after}.` };
    }
    case "reply":
      return { actor: item.actorName ?? "Someone", text: c?.ownRoot ? "replied to your comment on" : "replied in a conversation on", code: where };
    case "pull_activity":
      if (c?.kind === "review") {
        const verb = c.state === "APPROVED" ? "approved this pull request." : c.state === "CHANGES_REQUESTED" ? "requested changes." : "reviewed this pull request.";
        return { actor: item.actorName ?? "Someone", text: verb };
      }
      return { actor: item.actorName ?? "Someone", text: c?.kind === "reply" ? "replied on" : "commented on", code: where };
  }
}

/** Detail lines under a new version: what happened to the sections the recipient reviewed. */
export function versionDetails(d: NotificationData): { changed: { title: string; url: string }[]; unchangedText: string | null } {
  const unchanged = d.unchanged ?? 0;
  const unchangedText =
    unchanged > 0 ? `${unchanged === 1 ? "1 section you reviewed is" : `${unchanged} sections you reviewed are`} unchanged; your marks carried over.` : null;
  return { changed: d.changed ?? [], unchangedText };
}

/**
 * A comment as plain text for an email: suggestions are named rather than shown, the attribution
 * line of comments posted through the workspace connection is dropped, and long text is cut.
 */
export function excerpt(body: string, max = 400): string {
  const text = body
    .replace(/```suggestion[^\n]*\n[\s\S]*?```/g, "[Suggested change]")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/<sub>Posted by [^<]* via [^<]*<\/sub>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\[([^\]]+)\]\((?:diff:)?[^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
