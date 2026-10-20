/**
 * Messages for Slack incoming webhooks (Block Kit) and the JSON webhook payload, plus a small
 * parser for Slack's mrkdwn used by the preview in the settings. Pure functions.
 */
import type { ChannelEventData, ReviewState } from "./types";

export type SlackText = { type: "mrkdwn" | "plain_text"; text: string };
export type SlackButton = { type: "button"; text: SlackText; url: string; style?: "primary" };
export type SlackBlock =
  | { type: "section"; text: SlackText }
  | { type: "context"; elements: SlackText[] }
  | { type: "actions"; elements: SlackButton[] }
  | { type: "divider" };
export type SlackMessage = { text: string; blocks: SlackBlock[] };

/** Escape text for mrkdwn: Slack reads &, < and > as markup. */
export function mrkdwnEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const link = (url: string, label: string) => `<${url}|${mrkdwnEscape(label).replace(/\|/g, "¦")}>`;
const button = (text: string, url: string, primary = false): SlackButton => ({
  type: "button",
  text: { type: "plain_text", text },
  url,
  ...(primary ? { style: "primary" as const } : {}),
});

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function reviewVerb(state: ReviewState): string {
  return state === "APPROVED" ? "approved" : state === "CHANGES_REQUESTED" ? "requested changes on" : "reviewed";
}

function quoteLines(body: string, max = 600): string {
  const text = body.length > max ? `${body.slice(0, max).replace(/\s+\S*$/, "")}…` : body;
  return text
    .split("\n")
    .map((l) => `>${l ? ` ${mrkdwnEscape(l)}` : ""}`)
    .join("\n");
}

/** The Block Kit message for a workspace event. `text` is the notification fallback. */
export function slackMessage(e: ChannelEventData): SlackMessage {
  const pr = `${e.repository} #${e.pullRequest.number}`;
  const prLink = link(e.pullRequest.url, pr);
  const g = e.guide;
  const actions: SlackButton[] = [];
  if (g) actions.push(button("Open the guide", g.url, true));
  const blocks: SlackBlock[] = [];
  let text: string;
  let context: string;

  if (e.event === "review_submitted" && e.review) {
    const who = e.actor ?? "Someone";
    text = `${who} ${reviewVerb(e.review.state)} ${pr}: ${e.pullRequest.title}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${mrkdwnEscape(who)} ${reviewVerb(e.review.state)} ${link(e.pullRequest.url, `${pr} ${e.pullRequest.title}`)}*` } });
    if (e.review.body.trim()) blocks.push({ type: "section", text: { type: "mrkdwn", text: quoteLines(e.review.body.trim()) } });
    actions.push(button("View the review", e.review.url));
    context = `Review completed · ${mrkdwnEscape(e.workspace.name)}`;
  } else if (g && e.event === "new_version") {
    text = `New version of the guide for ${pr}: ${g.title}`;
    const by = e.actor ? `, published by ${mrkdwnEscape(e.actor)}` : "";
    const lines = [`*${link(g.url, g.title)}*`, `Version ${g.version} of the guide for ${prLink}${by}.`];
    const changes = [
      g.changed && g.changed.length > 0 ? `Changed: ${g.changed.map(mrkdwnEscape).join(", ")}` : null,
      g.added ? `${plural(g.added, "new section")}` : null,
    ].filter(Boolean);
    lines.push(changes.length > 0 ? changes.join(" · ") : "No section's code changed.");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
    context = `New version · ${plural(g.sections, "section")} · ${mrkdwnEscape(e.workspace.name)}`;
  } else if (g) {
    text = `Guide ready for ${pr}: ${g.title}`;
    const by = e.actor ? ` by ${mrkdwnEscape(e.actor)}` : "";
    const author = g.author && g.author !== e.actor ? ` (written with ${mrkdwnEscape(g.author)})` : "";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${link(g.url, g.title)}*\nA guide with ${plural(g.sections, "section")} is ready for ${prLink}, published${by}${author}.` },
    });
    context = `Guide published${e.pullRequest.author ? ` · pull request by ${mrkdwnEscape(e.pullRequest.author)}` : ""} · ${mrkdwnEscape(e.workspace.name)}`;
  } else {
    text = `${pr}: ${e.pullRequest.title}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${link(e.pullRequest.url, `${pr} ${e.pullRequest.title}`)}*` } });
    context = mrkdwnEscape(e.workspace.name);
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: context }] });
  // A review links to itself on GitHub instead.
  if (!(e.event === "review_submitted" && e.review)) actions.push(button("View on GitHub", e.pullRequest.url));
  blocks.push({ type: "actions", elements: actions });
  return { text, blocks };
}

/** What "Send test message" posts. */
export function slackTestMessage(input: { workspaceName: string; workspaceUrl: string; sentBy: string; events: string[] }): SlackMessage {
  const list = input.events.length > 0 ? input.events.join(", ").toLowerCase() : "nothing yet; pick events in the settings";
  return {
    text: `Omakaze is connected to ${input.workspaceName}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*Omakaze is connected.*\nNotifications from ${link(input.workspaceUrl, input.workspaceName)} will appear here: ${mrkdwnEscape(list)}.` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Test message sent by ${mrkdwnEscape(input.sentBy)}` }] },
    ],
  };
}

/** The JSON webhook body: the event with snake_case keys. */
export function webhookPayload(e: ChannelEventData) {
  return {
    event: e.event,
    id: e.key,
    sent_at: e.at,
    workspace: e.workspace,
    repository: e.repository,
    pull_request: e.pullRequest,
    guide: e.guide
      ? {
          version: e.guide.version,
          title: e.guide.title,
          url: e.guide.url,
          sections: e.guide.sections,
          author: e.guide.author,
          ...(e.event === "new_version" ? { changed_sections: e.guide.changed ?? [], new_sections: e.guide.added ?? 0 } : {}),
        }
      : null,
    actor: e.actor,
    review: e.review ? { state: e.review.state.toLowerCase(), body: e.review.body, url: e.review.url } : null,
  };
}

/* mrkdwn for the preview --------------------------------------------- */

export type MrkdwnNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; url: string; children: MrkdwnNode[] }
  | { type: "bold" | "italic"; children: MrkdwnNode[] };

export type MrkdwnLine = { quote: boolean; nodes: MrkdwnNode[] };

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Inline mrkdwn: *bold*, _italic_, `code` and <url|label> links. Enough for the messages built here. */
export function parseInline(s: string): MrkdwnNode[] {
  const out: MrkdwnNode[] = [];
  const re = /<([^|>\s]+)(?:\|([^>]*))?>|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ type: "text", text: unescape(s.slice(last, m.index)) });
    if (m[1]) out.push({ type: "link", url: m[1], children: parseInline(m[2] ?? m[1]) });
    else if (m[3] !== undefined) out.push({ type: "bold", children: parseInline(m[3]) });
    else if (m[4] !== undefined) out.push({ type: "italic", children: parseInline(m[4]) });
    else out.push({ type: "code", text: unescape(m[5]) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: "text", text: unescape(s.slice(last)) });
  return out;
}

export function parseMrkdwn(text: string): MrkdwnLine[] {
  return text.split("\n").map((line) => {
    const quote = line.startsWith(">");
    return { quote, nodes: parseInline(quote ? line.replace(/^> ?/, "") : line) };
  });
}
