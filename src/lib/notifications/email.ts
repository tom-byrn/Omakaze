/**
 * The notification email: HTML with inline styles and tables (what email clients render
 * reliably) in the product's style (dashed rules, square corners, serif headings, mono labels),
 * and a plain-text part with the same content. Pure functions.
 */
import { digestSubject, excerpt, itemHeadline, versionDetails, type DigestGroup, type DigestItem } from "./digest";

export type EmailLinks = {
  /** Account notification settings. */
  settings: string;
  /** Unsubscribe from all notification email. */
  unsubscribe: string;
  /** Mute one workspace, by workspace ID. */
  mute: Record<string, string>;
};

export type RenderedEmail = { subject: string; text: string; html: string; preheader: string };

const SERIF = "Newsreader, Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const INK = "#141518";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const MAX_ITEMS = 12;

function quote(item: DigestItem): string | null {
  const body = item.data.comment?.body;
  return body ? excerpt(body) : null;
}

function itemLink(item: DigestItem, group: DigestGroup): string | null {
  if (item.type === "reply" || item.type === "pull_activity") return item.data.url !== group.url ? item.data.url : null;
  return null;
}

/* HTML ---------------------------------------------------------------- */

function htmlHeadline(item: DigestItem): string {
  const h = itemHeadline(item);
  const actor = h.actor ? `<strong style="color:${INK};font-weight:600;">${escapeHtml(h.actor)}</strong> ` : "";
  const code = h.code
    ? ` <span style="font-family:${MONO};font-size:12px;color:${INK};background:#f4f4f3;border:1px solid #e0e0e0;padding:1px 4px;">${escapeHtml(h.code)}</span>`
    : "";
  return `${actor}${escapeHtml(h.text)}${code}`;
}

function htmlItem(item: DigestItem, group: DigestGroup, first: boolean): string {
  const parts = [
    `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:22px;color:#3f3f3f;">${htmlHeadline(item)}</p>`,
  ];
  if (item.type === "new_version") {
    const { changed, unchangedText } = versionDetails(item.data);
    if (changed.length > 0) {
      parts.push(
        `<p style="margin:12px 0 4px 0;font-family:${MONO};font-size:10px;line-height:15px;letter-spacing:0.08em;text-transform:uppercase;color:#727272;">Changed since you reviewed</p>`,
        ...changed.map(
          (s) =>
            `<p style="margin:0;padding:6px 0;border-top:1px dashed #d4d4d4;font-family:${SANS};font-size:14px;line-height:20px;"><a href="${escapeHtml(s.url)}" style="color:${INK};text-decoration:underline;">${escapeHtml(s.title)}</a></p>`,
        ),
      );
    }
    if (unchangedText) parts.push(`<p style="margin:10px 0 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:#727272;">${escapeHtml(unchangedText)}</p>`);
  }
  const q = quote(item);
  if (q) {
    parts.push(
      `<div style="margin:10px 0 0 0;padding:2px 0 2px 12px;border-left:2px solid ${INK};font-family:${SANS};font-size:14px;line-height:22px;color:#565656;white-space:pre-wrap;">${escapeHtml(q)}</div>`,
    );
  }
  const link = itemLink(item, group);
  if (link) {
    parts.push(
      `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:13px;line-height:20px;"><a href="${escapeHtml(link)}" style="color:#565656;text-decoration:underline;">View the conversation</a></p>`,
    );
  }
  return `<tr><td style="padding:${first ? "0" : "16px"} 0 0 0;">${parts.join("")}</td></tr>`;
}

function htmlGroup(group: DigestGroup, index: number): string {
  const shown = group.items.slice(0, MAX_ITEMS);
  const more = group.items.length - shown.length;
  const hasGuide = group.items.some((i) => i.type === "guide_ready" || i.type === "new_version");
  return `
<tr><td style="padding:24px 28px;${index > 0 ? "border-top:1px dashed #d4d4d4;" : ""}">
  <p style="margin:0 0 6px 0;font-family:${MONO};font-size:10px;line-height:15px;letter-spacing:0.08em;text-transform:uppercase;color:#727272;">${escapeHtml(group.repo)} · #${group.prNumber}</p>
  <h2 style="margin:0 0 18px 0;font-family:${SERIF};font-weight:400;font-size:22px;line-height:26px;letter-spacing:-0.01em;color:#000000;"><a href="${escapeHtml(group.url)}" style="color:#000000;text-decoration:none;">${escapeHtml(group.prTitle)}</a></h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${shown.map((item, i) => htmlItem(item, group, i === 0)).join("")}</table>
  ${more > 0 ? `<p style="margin:14px 0 0 0;font-family:${SANS};font-size:13px;color:#727272;">And ${more} more.</p>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0 0;"><tr><td style="background:${INK};border:1px solid ${INK};">
    <a href="${escapeHtml(group.url)}" style="display:inline-block;padding:11px 20px;font-family:${SERIF};font-weight:500;font-size:14px;line-height:16px;letter-spacing:0.01em;color:#ffffff;text-decoration:none;">${hasGuide ? "Open the guide" : "Open in Omakaze"}</a>
  </td></tr></table>
</td></tr>`;
}

function footerLinks(groups: DigestGroup[], links: EmailLinks, html: boolean): string[] {
  const out: { label: string; url: string }[] = [{ label: "Notification settings", url: links.settings }];
  const seen = new Set<string>();
  for (const g of groups) {
    if (seen.has(g.workspaceId) || !links.mute[g.workspaceId]) continue;
    seen.add(g.workspaceId);
    out.push({ label: `Mute ${g.workspaceName}`, url: links.mute[g.workspaceId] });
  }
  out.push({ label: "Unsubscribe", url: links.unsubscribe });
  return out.map((l) => (html ? `<a href="${escapeHtml(l.url)}" style="color:#727272;text-decoration:underline;">${escapeHtml(l.label)}</a>` : `${l.label}: ${l.url}`));
}

function reasonLine(groups: DigestGroup[]): string {
  const types = new Set(groups.flatMap((g) => g.items.map((i) => i.type)));
  const why: string[] = [];
  if (types.has("guide_ready")) why.push("your review is requested or you're assigned");
  if (types.has("new_version")) why.push("you reviewed an earlier version");
  if (types.has("reply")) why.push("you're in the conversation");
  if (types.has("pull_activity")) why.push("you opened the pull request");
  const list = why.length > 1 ? `${why.slice(0, -1).join(", ")} or ${why.at(-1)}` : why[0];
  return `You get this email because ${list}.`;
}

function preheaderFor(groups: DigestGroup[]): string {
  const first = groups[0]?.items[0];
  if (!first) return "";
  const h = itemHeadline(first);
  return [h.actor, h.text, h.code].filter(Boolean).join(" ").slice(0, 140);
}

/* Text ---------------------------------------------------------------- */

function textItem(item: DigestItem, group: DigestGroup): string {
  const h = itemHeadline(item);
  const lines = [`- ${[h.actor, h.text, h.code].filter(Boolean).join(" ")}`];
  if (item.type === "new_version") {
    const { changed, unchangedText } = versionDetails(item.data);
    if (changed.length > 0) {
      lines.push("  Changed since you reviewed:");
      for (const s of changed) lines.push(`  * ${s.title}: ${s.url}`);
    }
    if (unchangedText) lines.push(`  ${unchangedText}`);
  }
  const q = quote(item);
  if (q) lines.push(...q.split("\n").map((l) => `  > ${l}`));
  const link = itemLink(item, group);
  if (link) lines.push(`  ${link}`);
  return lines.join("\n");
}

/* Email --------------------------------------------------------------- */

export function renderDigestEmail(groups: DigestGroup[], links: EmailLinks): RenderedEmail {
  const subject = digestSubject(groups);
  const preheader = preheaderFor(groups);
  const workspaces = [...new Set(groups.map((g) => g.workspaceName))];

  const text = [
    `Omakaze · ${workspaces.join(", ")}`,
    "",
    ...groups.flatMap((g) => {
      const shown = g.items.slice(0, MAX_ITEMS);
      const more = g.items.length - shown.length;
      return [`${g.repo} #${g.prNumber}: ${g.prTitle}`, g.url, "", ...shown.map((i) => textItem(i, g)), ...(more > 0 ? [`And ${more} more.`] : []), ""];
    }),
    "--",
    reasonLine(groups),
    ...footerLinks(groups, links, false),
    "",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fcfcfc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fcfcfc;">
<tr><td align="center" style="padding:32px 16px 40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 0 16px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF};font-size:22px;line-height:28px;letter-spacing:-0.02em;color:${INK};">Omakaze</td>
      <td align="right"><span style="display:inline-block;padding:3px 8px;border:1px dashed rgba(0,0,0,0.25);font-family:${MONO};font-size:10px;line-height:15px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(0,0,0,0.6);">${escapeHtml(workspaces.join(" · "))}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid #d9d9d9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${groups.map(htmlGroup).join("")}</table>
  </td></tr>
  <tr><td style="padding:18px 2px 0 2px;font-family:${SANS};font-size:12px;line-height:19px;color:#898989;">
    ${escapeHtml(reasonLine(groups))}<br>
    ${footerLinks(groups, links, true).join(" &nbsp;·&nbsp; ")}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html, preheader };
}
