/**
 * A workspace's Slack incoming webhook and JSON webhook: settings (the URLs and the signing secret
 * are encrypted at rest) and posting to them.
 */
import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { guideSections, guides, notificationChannels, pullRequests, repositories, type ChannelEvent } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { newToken } from "@/lib/ids";
import { isPublicAddress, publicLookup } from "@/lib/storage/remote";
import { slackTestMessage } from "./slack";
import { CHANNEL_EVENT_LABELS, CHANNEL_EVENTS, type ChannelEventData } from "./types";

export type Channel = typeof notificationChannels.$inferSelect;
export type ChannelKind = Channel["kind"];

export class ChannelError extends Error {}

export async function getChannels(workspaceId: string): Promise<Channel[]> {
  return db.select().from(notificationChannels).where(eq(notificationChannels.workspaceId, workspaceId));
}

export async function getChannel(workspaceId: string, kind: ChannelKind): Promise<Channel | null> {
  const [row] = await db
    .select()
    .from(notificationChannels)
    .where(and(eq(notificationChannels.workspaceId, workspaceId), eq(notificationChannels.kind, kind)))
    .limit(1);
  return row ?? null;
}

/** A URL that may be stored: http(s), no credentials in it, not absurdly long. */
export function validateWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ChannelError("Enter the full webhook URL, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ChannelError("The webhook URL must start with https:// or http://");
  if (url.username || url.password) throw new ChannelError("Webhook URLs with a user name or password are not supported");
  if (url.href.length > 2000) throw new ChannelError("The webhook URL is too long");
  return url.href;
}

/** Enough of a stored URL to recognize it: the host and path without the last segment (Slack's secret) or the query. */
export function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length <= 1) return `${url.origin}/${segments.length ? "…" : ""}`;
    return `${url.origin}/${segments.slice(0, -1).join("/")}/…`;
  } catch {
    return "…";
  }
}

export async function saveChannel(
  workspaceId: string,
  kind: ChannelKind,
  input: { url: string | null; events: ChannelEvent[]; userId: string },
): Promise<Channel> {
  const events = CHANNEL_EVENTS.filter((e) => input.events.includes(e));
  const existing = await getChannel(workspaceId, kind);
  if (!existing && !input.url) throw new ChannelError("Enter a webhook URL");
  const urlEnc = input.url ? encrypt(validateWebhookUrl(input.url)) : existing!.urlEnc;
  const secretEnc = kind === "webhook" ? (existing?.secretEnc ?? encrypt(newToken("whsec", 24))) : null;
  const [row] = await db
    .insert(notificationChannels)
    .values({ workspaceId, kind, urlEnc, secretEnc, events, createdByUserId: input.userId })
    .onConflictDoUpdate({
      target: [notificationChannels.workspaceId, notificationChannels.kind],
      // A new URL starts with a clean delivery record.
      set: { urlEnc, events, updatedAt: new Date(), ...(input.url ? { lastError: null, lastDeliveryAt: null } : {}) },
    })
    .returning();
  return row;
}

export async function removeChannel(workspaceId: string, kind: ChannelKind): Promise<void> {
  await db.delete(notificationChannels).where(and(eq(notificationChannels.workspaceId, workspaceId), eq(notificationChannels.kind, kind)));
}

export async function recordDelivery(channelId: string, error: string | null): Promise<void> {
  await db
    .update(notificationChannels)
    .set(error ? { lastError: error.slice(0, 500) } : { lastError: null, lastDeliveryAt: new Date() })
    .where(eq(notificationChannels.id, channelId));
}

/** `sha256=<hex>`: HMAC-SHA256 of the raw body, like GitHub's X-Hub-Signature-256. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export type PostResult = { ok: boolean; status: number; error: string | null; retry: boolean };

const TIMEOUT_MS = 10_000;

/**
 * POST a JSON body. Loopback and private network addresses are refused (checked on the address
 * the socket connects to) unless WEBHOOKS_ALLOW_PRIVATE_NETWORK is set, and redirects are not
 * followed. Never throws; `retry` says whether trying again later could help.
 */
export function postJson(rawUrl: string, body: string, headers: Record<string, string> = {}): Promise<PostResult> {
  return new Promise((resolve) => {
    const fail = (error: string, retry: boolean, status = 0) => resolve({ ok: false, status, error, retry });
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return fail("The webhook URL is not valid", false);
    }
    const allowPrivate = env().WEBHOOKS_ALLOW_PRIVATE_NETWORK;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivate && isIP(host) && !isPublicAddress(host)) return fail("Private network addresses are not allowed", false);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "POST",
        timeout: TIMEOUT_MS,
        ...(allowPrivate ? {} : { lookup: publicLookup as never }),
        headers: { "content-type": "application/json", "user-agent": "Omakaze", "content-length": String(Buffer.byteLength(body)), ...headers },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= 4096) chunks.push(c);
        });
        res.on("end", () => {
          if (status >= 200 && status < 300) return resolve({ ok: true, status, error: null, retry: false });
          const text = Buffer.concat(chunks).toString("utf8").replace(/\s+/g, " ").trim().slice(0, 200);
          const where = status >= 300 && status < 400 ? " (redirects are not followed)" : "";
          fail(`HTTP ${status}${text ? `: ${text}` : ""}${where}`, status === 408 || status === 429 || status >= 500, status);
        });
        res.on("error", (err) => fail(err.message, true, status));
      },
    );
    req.on("timeout", () => req.destroy(new Error("No answer within 10 seconds")));
    req.on("error", (err) => fail(err.message.includes("private network") ? err.message : `Could not connect: ${err.message}`, !err.message.includes("private network")));
    req.end(body);
  });
}

function post(kind: ChannelKind, url: string, secretEnc: string | null, message: { slack: unknown; json: unknown; event: string }): Promise<PostResult> {
  if (kind === "slack") return postJson(url, JSON.stringify(message.slack));
  const body = JSON.stringify(message.json);
  const headers: Record<string, string> = { "x-omakaze-event": message.event };
  if (secretEnc) headers["x-omakaze-signature-256"] = signBody(body, decrypt(secretEnc));
  return postJson(url, body, headers);
}

/** Post a message to a channel: Slack gets `slack`, a JSON webhook gets `json`, signed. */
export function postToChannel(channel: Channel, message: { slack: unknown; json: unknown; event: string }): Promise<PostResult> {
  return post(channel.kind, decrypt(channel.urlEnc), channel.secretEnc, message);
}

/** "Send test message": to the URL being entered, or the saved one. */
export async function sendTestMessage(input: {
  kind: ChannelKind;
  url: string | null;
  channel: Channel | null;
  workspace: { name: string; slug: string };
  sentBy: string;
  events: ChannelEvent[];
}): Promise<PostResult> {
  const url = input.url ? validateWebhookUrl(input.url) : input.channel ? decrypt(input.channel.urlEnc) : null;
  if (!url) throw new ChannelError("Enter a webhook URL first");
  const workspaceUrl = `${env().APP_URL}/w/${input.workspace.slug}`;
  const labels = input.events.map((e) => CHANNEL_EVENT_LABELS[e].label);
  return post(input.kind, url, input.channel?.secretEnc ?? null, {
    slack: slackTestMessage({ workspaceName: input.workspace.name, workspaceUrl, sentBy: input.sentBy, events: labels }),
    json: { event: "test", id: `test:${Date.now()}`, sent_at: new Date().toISOString(), workspace: { name: input.workspace.name, slug: input.workspace.slug, url: workspaceUrl }, message: `Test message sent by ${input.sentBy}` },
    event: "test",
  });
}

/**
 * Example events for the preview in the settings, from the workspace's latest published guide
 * (or made up when there is none): what each kind of message looks like for this workspace.
 */
export async function previewEvents(workspace: { id: string; name: string; slug: string }, viewerName: string): Promise<ChannelEventData[]> {
  const [row] = await db
    .select({ guide: guides, repo: repositories, pull: pullRequests })
    .from(guides)
    .innerJoin(repositories, eq(repositories.id, guides.repositoryId))
    .leftJoin(pullRequests, and(eq(pullRequests.repositoryId, guides.repositoryId), eq(pullRequests.number, guides.prNumber)))
    .where(and(eq(guides.workspaceId, workspace.id), eq(guides.status, "ready")))
    .orderBy(desc(guides.updatedAt))
    .limit(1);
  const sections = row ? await db.select({ title: guideSections.title, generated: guideSections.generated }).from(guideSections).where(eq(guideSections.guideId, row.guide.id)).orderBy(asc(guideSections.position)) : [];
  const app = env().APP_URL;
  const repo = row?.repo.fullName ?? "acme/web";
  const number = row?.guide.prNumber ?? 42;
  const url = row ? `${app}/w/${workspace.slug}/${repo}/pull/${number}` : `${app}/w/${workspace.slug}`;
  const base = {
    workspace: { name: workspace.name, slug: workspace.slug, url: `${app}/w/${workspace.slug}` },
    repository: repo,
    pullRequest: {
      number,
      title: row?.pull?.title ?? row?.guide.title ?? "Add a checkout page",
      url: row?.pull?.htmlUrl ?? `https://github.com/${repo}/pull/${number}`,
      author: row?.pull?.authorLogin ?? "octocat",
    },
    at: new Date().toISOString(),
  };
  const guide = {
    version: 1,
    title: row?.guide.title ?? "Add a checkout page",
    url,
    sections: sections.length || 5,
    author: row?.guide.author ?? null,
  };
  const firstSection = sections.find((s) => !s.generated)?.title ?? "Validating the cart";
  return [
    { ...base, key: "preview:published", event: "guide_published", actor: viewerName, guide },
    { ...base, key: "preview:version", event: "new_version", actor: viewerName, guide: { ...guide, version: 2, url: `${url}?v=2`, changed: [firstSection], added: 1 } },
    {
      ...base,
      key: "preview:review",
      event: "review_submitted",
      actor: viewerName,
      guide,
      review: { state: "APPROVED", body: "Looks good. The guide made the order of the changes easy to follow.", url: `${base.pullRequest.url}#pullrequestreview-1` },
    },
  ];
}
