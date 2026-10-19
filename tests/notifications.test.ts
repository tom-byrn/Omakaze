import { describe, expect, it } from "vitest";
import type { SectionMatch } from "@/lib/guides/carryover";
import { coalesce, digestDelaySeconds, digestSubject, excerpt, itemHeadline, type DigestItem } from "@/lib/notifications/digest";
import { escapeHtml, renderDigestEmail } from "@/lib/notifications/email";
import { maskUrl, signBody, validateWebhookUrl } from "@/lib/notifications/channels";
import { eventKey } from "@/lib/notifications/hooks";
import { readUnsubscribeToken, unsubscribeToken } from "@/lib/notifications/prefs";
import { commentRecipients, emailBlocker, guideRecipients, reviewedChanges, wantsEmail } from "@/lib/notifications/recipients";
import { mrkdwnEscape, parseMrkdwn, slackMessage, webhookPayload } from "@/lib/notifications/slack";
import type { ChannelEventData, NotificationData } from "@/lib/notifications/types";

const members = new Set(["alex", "maya", "sam", "priya"]);

describe("recipients of a published guide", () => {
  it("tells earlier reviewers about the new version and requested reviewers and assignees that a guide is ready", () => {
    const out = guideRecipients({
      actorUserId: "alex",
      memberIds: members,
      reviewers: [
        { userId: "maya", changed: ["s2"], unchanged: 2 },
        { userId: "alex", changed: [], unchanged: 1 },
      ],
      requestedUserIds: ["alex", "sam", "maya"],
      assigneeUserIds: ["priya", "sam", "outsider"],
    });
    expect(out.map((r) => [r.userId, r.type])).toEqual([
      ["maya", "new_version"],
      ["sam", "guide_ready"],
      ["priya", "guide_ready"],
    ]);
    expect(out[0].data).toEqual({ unchanged: 2 });
    expect(out[1].data).toEqual({ reason: "requested" });
    expect(out[2].data).toEqual({ reason: "assigned" });
  });

  it("never includes the actor or people who are not members", () => {
    const out = guideRecipients({ actorUserId: "sam", memberIds: members, reviewers: [], requestedUserIds: ["sam", "devon"], assigneeUserIds: [] });
    expect(out).toEqual([]);
  });

  it("includes everyone when an automation published the guide", () => {
    const out = guideRecipients({ actorUserId: null, memberIds: members, reviewers: [], requestedUserIds: ["alex"], assigneeUserIds: ["alex"] });
    expect(out).toEqual([{ userId: "alex", type: "guide_ready", data: { reason: "requested" } }]);
  });
});

describe("recipients of a comment", () => {
  it("tells everyone earlier in the conversation, marking the one who started it", () => {
    const out = commentRecipients({ actorUserId: "sam", memberIds: members, thread: ["alex", "maya", "sam", null, "maya"], prAuthorUserId: "maya", viaOmakaze: true });
    expect(out.map((r) => [r.userId, r.type, r.data.comment?.ownRoot])).toEqual([
      ["alex", "reply", true],
      ["maya", "reply", false],
    ]);
  });

  it("tells the pull request's author about comments posted in a guide, once", () => {
    expect(commentRecipients({ actorUserId: "sam", memberIds: members, thread: [], prAuthorUserId: "maya", viaOmakaze: true })).toEqual([
      { userId: "maya", type: "pull_activity", data: {} },
    ]);
    // GitHub tells the author about comments made there.
    expect(commentRecipients({ actorUserId: "sam", memberIds: members, thread: [], prAuthorUserId: "maya", viaOmakaze: false })).toEqual([]);
    // Their own comment on their own pull request.
    expect(commentRecipients({ actorUserId: "maya", memberIds: members, thread: ["alex"], prAuthorUserId: "maya", viaOmakaze: true }).map((r) => r.userId)).toEqual(["alex"]);
  });

  it("skips a root comment by the replier and non-members", () => {
    expect(commentRecipients({ actorUserId: "alex", memberIds: members, thread: ["alex", "devon"], prAuthorUserId: null, viaOmakaze: true })).toEqual([]);
  });
});

describe("sections a member reviewed", () => {
  const unchanged = (previousId: string): SectionMatch => ({ status: "unchanged", previousId });
  const changed = (previousId: string): SectionMatch => ({ status: "changed", previousId, previous: new Map(), current: new Map() });

  it("splits reviewed sections by whether their code changed, the newest marked version deciding", () => {
    const v2 = { version: 2, matches: new Map<string, SectionMatch>([["n1", unchanged("b1")], ["n2", changed("b2")], ["n3", { status: "new" }]]), marked: new Set(["b1"]) };
    const v1 = { version: 1, matches: new Map<string, SectionMatch>([["n1", unchanged("a1")], ["n2", changed("a2")], ["n4", unchanged("a4")]]), marked: new Set(["a1", "a2", "a4"]) };
    // n1: v2 has the mark (unchanged); n2: only v1's mark, changed since; n4: v1, unchanged; n3 is new.
    expect(reviewedChanges([v2, v1])).toEqual({ changed: ["n2"], unchanged: ["n1", "n4"] });
  });

  it("returns nothing for a member without marks on matching sections", () => {
    expect(reviewedChanges([{ version: 1, matches: new Map([["n1", unchanged("a1")]]), marked: new Set(["other"]) }])).toEqual({ changed: [], unchanged: [] });
  });
});

describe("preferences and availability", () => {
  const all = { email: true, guideReady: true, newVersion: true, replies: true, pullActivity: true };
  it("follows each switch and the master switch", () => {
    expect(wantsEmail(all, "reply")).toBe(true);
    expect(wantsEmail({ ...all, replies: false }, "reply")).toBe(false);
    expect(wantsEmail({ ...all, replies: false }, "guide_ready")).toBe(true);
    expect(wantsEmail({ ...all, email: false }, "guide_ready")).toBe(false);
    expect(wantsEmail({ ...all, pullActivity: false }, "pull_activity")).toBe(false);
    expect(wantsEmail({ ...all, newVersion: false }, "new_version")).toBe(false);
  });

  it("says why email can't be sent, instance first", () => {
    expect(emailBlocker({ enabled: false, smtp: false, email: null, verified: false })).toBe("instance");
    expect(emailBlocker({ enabled: true, smtp: false, email: "a@b.c", verified: true })).toBe("smtp");
    expect(emailBlocker({ enabled: true, smtp: true, email: null, verified: false })).toBe("no_email");
    expect(emailBlocker({ enabled: true, smtp: true, email: "a@b.c", verified: false })).toBe("unverified");
    expect(emailBlocker({ enabled: true, smtp: true, email: "a@b.c", verified: true })).toBeNull();
  });

  it("waits for the chosen grouping delay", () => {
    expect(digestDelaySeconds("minutes", 300)).toBe(300);
    expect(digestDelaySeconds("hourly", 300)).toBe(3600);
    expect(digestDelaySeconds("daily", 300)).toBe(86_400);
  });
});

const data = (over: Partial<NotificationData> = {}): NotificationData => ({
  workspaceName: "Acme",
  repo: "acme/storefront",
  prTitle: "Apply promo codes at checkout",
  url: "https://omakaze.example/w/demo/acme/storefront/pull/128",
  ...over,
});

let seq = 0;
const item = (over: Partial<DigestItem> & { data?: NotificationData }): DigestItem => ({
  id: `n${++seq}`,
  type: "reply",
  workspaceId: "ws1",
  repositoryId: "r1",
  prNumber: 128,
  actorName: "Sam Okafor",
  createdAt: new Date(Date.UTC(2026, 9, 19, 9, seq)),
  data: data(),
  ...over,
});

describe("coalescing", () => {
  it("groups by pull request in order of the first notification, guide news first", () => {
    const groups = coalesce([
      item({ data: data({ comment: { kind: "reply", body: "first", path: "a.ts", line: 3, ownRoot: true } }) }),
      item({ prNumber: 131, data: data({ prTitle: "CDN images", url: "https://x/131" }), type: "guide_ready" }),
      item({ type: "new_version", data: data({ version: 3, url: "https://x/128?v=3" }) }),
      item({ data: data({ comment: { kind: "reply", body: "second", path: "a.ts", line: 3 } }) }),
    ]);
    expect(groups.map((g) => g.prNumber)).toEqual([128, 131]);
    expect(groups[0].items.map((i) => i.type)).toEqual(["new_version", "reply", "reply"]);
    expect(groups[0].url).toBe("https://x/128?v=3");
    expect(groups[1].url).toBe("https://x/131");
  });

  it("keeps only the newest guide version of a pull request", () => {
    const groups = coalesce([
      item({ type: "guide_ready", data: data({ version: 2 }) }),
      item({ type: "new_version", data: data({ version: 3 }) }),
      item({ type: "guide_ready", data: data({ version: 1 }) }),
    ]);
    expect(groups[0].items.map((i) => [i.type, i.data.version])).toEqual([["new_version", 3]]);
  });

  it("names a single notification in the subject and counts the rest", () => {
    const reply = item({ data: data({ comment: { kind: "reply", body: "x", path: "a.ts", line: 1, ownRoot: true } }) });
    expect(digestSubject(coalesce([reply]))).toBe("Sam Okafor replied to your comment on #128");
    expect(digestSubject(coalesce([item({ type: "new_version", actorName: "Alex Morgan", data: data({ version: 3, changed: [{ title: "Validating", url: "u" }] }) })]))).toBe(
      "Version 3 of #128 Apply promo codes at checkout: 1 section you reviewed changed",
    );
    expect(digestSubject(coalesce([item({ type: "guide_ready" })]))).toBe("Guide ready to review: #128 Apply promo codes at checkout");
    expect(digestSubject(coalesce([item({ type: "pull_activity", actorName: "Alex Morgan", data: data({ comment: { kind: "review", body: "", path: null, line: null, state: "APPROVED" } }) })]))).toBe(
      "Alex Morgan approved #128 Apply promo codes at checkout",
    );
    expect(digestSubject(coalesce([reply, item({})]))).toBe("2 updates on #128 Apply promo codes at checkout");
    expect(digestSubject(coalesce([reply, item({ prNumber: 131 })]))).toBe("2 updates on 2 pull requests in Acme");
  });

  it("describes what happened", () => {
    expect(itemHeadline(item({ data: data({ comment: { kind: "reply", body: "", path: "src/a.ts", line: 4, ownRoot: false } }) }))).toEqual({
      actor: "Sam Okafor",
      text: "replied in a conversation on",
      code: "src/a.ts:4",
    });
    expect(itemHeadline(item({ type: "guide_ready", actorName: null, data: data({ sections: 2, reason: "assigned" }) })).text).toBe(
      "A guide is ready with 2 sections. You're assigned to this pull request.",
    );
    expect(itemHeadline(item({ type: "new_version", actorName: null, data: data({ version: 4, pushed: true }) })).text).toBe("Version 4 of the guide was published after new commits.");
  });
});

describe("email", () => {
  it("cleans comments up for an excerpt", () => {
    expect(excerpt("Nit:\n\n```suggestion\nconst x = 1;\n```\n\n<sub>Posted by Sam via [Omakaze](https://x)</sub>")).toBe("Nit:\n\n[Suggested change]");
    expect(excerpt("See [the docs](https://x) and ![a](b)")).toBe("See the docs and [image]");
    expect(excerpt("word ".repeat(200), 30)).toBe("word word word word word word…");
  });

  it("renders HTML and text with escaped content and the footer links", () => {
    const groups = coalesce([
      item({ type: "new_version", actorName: "Alex <script>", data: data({ version: 3, pushed: true, unchanged: 2, changed: [{ title: "Validating a code", url: "https://x/128?v=3&section=2" }] }) }),
      item({ data: data({ url: "https://x/128?section=2", comment: { kind: "reply", body: "Use `>=` & add a test", path: "src/lib/promo.ts", line: 42, ownRoot: true } }) }),
    ]);
    const email = renderDigestEmail(groups, { settings: "https://x/account#notifications", unsubscribe: "https://x/unsubscribe?token=all", mute: { ws1: "https://x/unsubscribe?token=ws1" } });
    expect(email.subject).toBe("2 updates on #128 Apply promo codes at checkout");
    expect(email.html).toContain("Alex &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Use `&gt;=` &amp; add a test");
    expect(email.html).toContain('href="https://x/128?v=3&amp;section=2"');
    expect(email.html).toContain("Mute Acme");
    expect(email.html).toContain("Open the guide");
    expect(email.text).toContain("acme/storefront #128: Apply promo codes at checkout");
    expect(email.text).toContain("  * Validating a code: https://x/128?v=3&section=2");
    expect(email.text).toContain("2 sections you reviewed are unchanged; your marks carried over.");
    expect(email.text).toContain("  > Use `>=` & add a test");
    expect(email.text).toContain("Unsubscribe: https://x/unsubscribe?token=all");
    expect(email.text).toContain("You get this email because you reviewed an earlier version or you're in the conversation.");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });
});

const event = (over: Partial<ChannelEventData> = {}): ChannelEventData => ({
  event: "guide_published",
  key: "guide:g1",
  workspace: { name: "Acme", slug: "demo", url: "https://x/w/demo" },
  repository: "acme/storefront",
  pullRequest: { number: 131, title: "Serve images <fast>", url: "https://github.com/acme/storefront/pull/131", author: "devon-ko" },
  guide: { version: 1, title: "Serve images <fast>", url: "https://x/131?v=1", sections: 2, author: "Claude Code" },
  actor: "Maya Chen",
  at: "2026-10-19T09:00:00.000Z",
  ...over,
});

describe("Slack and JSON webhooks", () => {
  it("builds Block Kit with a link back to the guide", () => {
    const m = slackMessage(event());
    expect(m.text).toBe("Guide ready for acme/storefront #131: Serve images <fast>");
    expect(m.blocks[0]).toEqual({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*<https://x/131?v=1|Serve images &lt;fast&gt;>*\nA guide with 2 sections is ready for <https://github.com/acme/storefront/pull/131|acme/storefront #131>, published by Maya Chen (written with Claude Code).",
      },
    });
    expect(m.blocks.at(-1)).toEqual({
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Open the guide" }, url: "https://x/131?v=1", style: "primary" },
        { type: "button", text: { type: "plain_text", text: "View on GitHub" }, url: "https://github.com/acme/storefront/pull/131" },
      ],
    });
  });

  it("lists changed sections for a new version and quotes reviews", () => {
    const v = slackMessage(event({ event: "new_version", guide: { ...event().guide!, version: 3, changed: ["Validating a code"], added: 1 } }));
    expect(JSON.stringify(v.blocks)).toContain("Changed: Validating a code · 1 new section");
    const r = slackMessage(event({ event: "review_submitted", actor: "Alex Morgan", review: { state: "CHANGES_REQUESTED", body: "Needs a test.\nThanks", url: "https://github.com/r/1" } }));
    expect(r.text).toBe("Alex Morgan requested changes on acme/storefront #131: Serve images <fast>");
    expect(r.blocks[1]).toEqual({ type: "section", text: { type: "mrkdwn", text: "> Needs a test.\n> Thanks" } });
    expect(JSON.stringify(r.blocks.at(-1))).toContain("View the review");
    expect(JSON.stringify(r.blocks.at(-1))).not.toContain("View on GitHub");
  });

  it("sends snake_case JSON", () => {
    const p = webhookPayload(event({ event: "new_version", guide: { ...event().guide!, changed: ["A"], added: 0 } }));
    expect(p).toMatchObject({ event: "new_version", id: "guide:g1", pull_request: { number: 131 }, guide: { changed_sections: ["A"], new_sections: 0 }, review: null });
    expect(webhookPayload(event()).guide).not.toHaveProperty("changed_sections");
    expect(signBody("{}", "secret")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("parses mrkdwn for the preview", () => {
    expect(mrkdwnEscape("a & <b>")).toBe("a &amp; &lt;b&gt;");
    expect(parseMrkdwn("*<https://x|A &amp; B>* and `code`\n> quoted _it_")).toEqual([
      {
        quote: false,
        nodes: [
          { type: "bold", children: [{ type: "link", url: "https://x", children: [{ type: "text", text: "A & B" }] }] },
          { type: "text", text: " and " },
          { type: "code", text: "code" },
        ],
      },
      { quote: true, nodes: [{ type: "text", text: "quoted " }, { type: "italic", children: [{ type: "text", text: "it" }] }] },
    ]);
  });

  it("checks and masks webhook URLs", () => {
    expect(validateWebhookUrl(" https://hooks.slack.com/services/T1/B2/abc ")).toBe("https://hooks.slack.com/services/T1/B2/abc");
    expect(() => validateWebhookUrl("ftp://x")).toThrow("https:// or http://");
    expect(() => validateWebhookUrl("https://user:pw@x")).toThrow("user name or password");
    expect(() => validateWebhookUrl("hooks.slack.com")).toThrow("full webhook URL");
    expect(maskUrl("https://hooks.slack.com/services/T1/B2/secret")).toBe("https://hooks.slack.com/services/T1/B2/…");
    expect(maskUrl("https://example.com/hook?token=x")).toBe("https://example.com/…");
  });
});

describe("events and links", () => {
  it("keys events so a comment posted through Omakaze and its webhook are one", () => {
    const base = { repositoryId: "r1", prNumber: 1, commentId: 7, inReplyTo: null, actorUserId: null, actorLogin: null, body: "", path: null, line: null, url: "", sectionId: null };
    expect(eventKey({ kind: "comment", ...base, via: "omakaze" })).toBe(eventKey({ kind: "comment", ...base, via: "github" }));
    expect(eventKey({ kind: "comment", ...base, via: "omakaze", conversation: true })).toBe("issue-comment:r1:7");
    expect(eventKey({ kind: "guide_published", guideId: "g", actorUserId: null })).toBe("guide:g");
  });

  it("signs unsubscribe links for everything or one workspace", () => {
    expect(readUnsubscribeToken(unsubscribeToken("u1"))).toEqual({ uid: "u1" });
    expect(readUnsubscribeToken(unsubscribeToken("u1", "ws1"))).toEqual({ uid: "u1", ws: "ws1" });
    const [body] = unsubscribeToken("u1").split(".");
    expect(readUnsubscribeToken(`${body}.forged`)).toBeNull();
    expect(readUnsubscribeToken(null)).toBeNull();
  });
});
