import { createHash, createHmac, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, mockNotify, test, type DemoUserKey } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";
import type { CapturedMail } from "./mock-notify";

const TOKEN_NAME = "e2e notifications";
const NOTIFY_JOBS = ["notify_event", "send_notification_email", "post_notification_webhook"];

async function userId(user: DemoUserKey): Promise<string> {
  const [row] = await sql()`select id from users where lower(email) = ${DEMO_USERS[user].email}`;
  return row.id as string;
}

async function workspaceId(): Promise<string> {
  const [ws] = await sql()`select id from workspaces where slug = 'demo'`;
  return ws.id as string;
}

/** Publish a guide through the REST API as `user`, as an agent would. */
async function publish(request: APIRequestContext, user: DemoUserKey, pr: number, sections: { title: string; body?: string; refs: unknown[] }[]) {
  const token = `omk_e2e_${randomBytes(16).toString("hex")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    values (${`tok_${randomBytes(6).toString("hex")}`}, ${await userId(user)}, ${await workspaceId()}, ${TOKEN_NAME}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)})`;
  const res = await request.post("/api/v1/guides", {
    headers: { Authorization: `Bearer ${token}` },
    data: { pr: `${DEMO_REPO.fullName}#${pr}`, summary: "Written for the notifications spec.", sections },
    timeout: 120_000,
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; version: number };
}

/** The sections of #128 v2 with "Validating a code" narrowed to its test file, so its code changes in v3. */
async function versionThreeSections(request: APIRequestContext) {
  const token = `omk_e2e_${randomBytes(16).toString("hex")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    values (${`tok_${randomBytes(6).toString("hex")}`}, ${await userId("owner")}, ${await workspaceId()}, ${TOKEN_NAME}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)})`;
  const res = await request.get(`/api/v1/guides?pr=${encodeURIComponent(`${DEMO_REPO.fullName}#${DEMO_PRS.main}`)}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 120_000 });
  expect(res.status()).toBe(200);
  const v2 = (await res.json()) as { sections: { title: string; body: string; refs: unknown[]; automatic: boolean }[] };
  return v2.sections.filter((s) => !s.automatic).map((s) => (s.title === "Validating a code" ? { ...s, refs: ["tests/promo.test.ts"] } : s));
}

/** Send queued notification email now instead of after the grouping delay (NOTIFICATIONS_GROUP_SECONDS). */
async function flushEmail(): Promise<void> {
  await sql()`update jobs set run_at = now() where type = 'send_notification_email' and status = 'queued'`;
}

/**
 * Wait until `user` has `count` emails, sending queued ones right away (once every event so far has
 * been processed, so a burst still shares one email). Oldest first.
 */
async function inbox(user: DemoUserKey, count = 1): Promise<CapturedMail[]> {
  let mail: CapturedMail[] = [];
  await expect
    .poll(
      async () => {
        const [busy] = await sql()`select count(*)::int as n from jobs where type = 'notify_event' and status in ('queued', 'running')`;
        if (busy.n === 0) await flushEmail();
        mail = await mockNotify.mail({ to: DEMO_USERS[user].email });
        return mail.length;
      },
      { timeout: 45_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThanOrEqual(count);
  return mail;
}

/** Who got a notification about an event, as "<user key>:<type>". */
async function notified(eventKeyPattern: string): Promise<string[]> {
  const rows = await sql()`
    select u.email, n.type from notifications n join users u on u.id = n.user_id
    where n.event_key like ${eventKeyPattern} order by u.email`;
  const key = (email: string) => (Object.keys(DEMO_USERS) as DemoUserKey[]).find((k) => DEMO_USERS[k].email === email) ?? email;
  return rows.map((r) => `${key(r.email as string)}:${r.type}`);
}

/** The repository webhook secret the app derives from APP_SECRET (repoWebhookSecret in src/lib/crypto.ts). */
function webhookSecret(): string {
  const key = Buffer.from(hkdfSync("sha256", E2E.secret, "guided-prs", "hmac-webhook-secret", 32));
  return createHmac("sha256", key).update("repository-webhooks").digest("base64url");
}

const deliveries: string[] = [];

async function sendWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const delivery = `e2e-${randomUUID()}`;
  deliveries.push(delivery);
  const res = await fetch(`${E2E.appUrl}/api/github/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": delivery,
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", webhookSecret()).update(body).digest("hex")}`,
    },
    body,
  });
  expect(res.status, await res.text()).toBe(200);
}

/** Call the mock GitHub API as a member (as if they did something on GitHub). */
async function onGitHub(user: DemoUserKey, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${mockGitHub.url}/repos/${DEMO_REPO.fullName}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DEMO_USERS[user].github.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

const repository = { id: DEMO_REPO.githubId, full_name: DEMO_REPO.fullName };

function panel(page: Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

/** The sticky app header would cover, or be stitched into, screenshots of tall elements. */
async function unstickHeader(page: Page): Promise<void> {
  await page.addStyleTag({ content: "header.sticky { position: static !important; }" });
}

async function connectSlack(page: Page): Promise<void> {
  await page.goto(`${demoPaths.settings}/notifications`);
  const slack = panel(page, "Slack");
  await slack.getByLabel("Incoming webhook URL").fill(mockNotify.slackUrl);
  await slack.getByRole("button", { name: "Save" }).click();
  await expect(slack.getByRole("status")).toHaveText("Saved.");
}

async function restore(): Promise<void> {
  const extra = await sql()`
    select g.id from guides g join workspaces w on w.id = g.workspace_id
    where w.slug = 'demo' and ((g.pr_number = ${DEMO_PRS.main} and g.version > 2) or g.pr_number = ${DEMO_PRS.noGuide})`;
  for (const g of extra) {
    await sql()`delete from activity where guide_id = ${g.id}`;
    await sql()`delete from guides where id = ${g.id}`;
  }
  const ws = await workspaceId();
  const users = await sql()`select id from users where lower(email) in ${sql()(Object.values(DEMO_USERS).map((u) => u.email))}`;
  const ids = users.map((u) => u.id as string);
  await sql()`delete from notifications where workspace_id = ${ws}`;
  await sql()`delete from notification_channels where workspace_id = ${ws}`;
  await sql()`delete from notification_preferences where user_id in ${sql()(ids)}`;
  await sql()`delete from notification_mutes where user_id in ${sql()(ids)}`;
  await sql()`delete from api_tokens where name = ${TOKEN_NAME}`;
  await sql()`delete from activity where workspace_id = ${ws} and type = 'settings.updated' and data->>'section' = 'notifications'`;
  await sql()`delete from activity where type = 'comment.posted' and data->>'url' like '%discussion_r5%'`;
  await sql()`delete from comments where github_id >= 5000000`;
  if (deliveries.length > 0) await sql()`delete from webhook_deliveries where id in ${sql()(deliveries.splice(0))}`;
  await mockGitHub.reset();
}

test.beforeEach(async () => {
  await restore();
  // Earlier specs post comments too; their notifications must not join these emails. The mock
  // GitHub API numbers new comments from 5000001 again after a reset, so old event keys go too.
  await sql()`delete from jobs where type in ${sql()(NOTIFY_JOBS)}`;
  await mockNotify.reset();
});
test.afterEach(restore);

test.describe("Notifications", () => {
  test.skip(E2E.github !== "mock" || E2E.smtp !== "sink", "needs the mock GitHub API and the fake SMTP server");
  test.use({ user: "admin" });

  test("Slack, guide-ready email and grouped replies", async ({ page, request, loginAs }) => {
    test.setTimeout(E2E.demo ? 360_000 : 180_000);
    videoName("notifications-walkthrough");

    // Maya connects the workspace to Slack.
    await page.goto(`${demoPaths.settings}/notifications`);
    const slack = panel(page, "Slack");
    await expect(slack).toContainText("Not connected.");
    await caption(page, "Workspace settings → Notifications: an admin connects a Slack incoming webhook", "Slack");
    await pause(page, 1500);
    await slack.getByLabel("Incoming webhook URL").fill(mockNotify.slackUrl);
    await slack.getByRole("button", { name: "Send test message" }).click();
    await expect(slack.getByRole("status")).toHaveText("Test message sent (HTTP 200).");
    const [test1] = await mockNotify.hooks({ path: /^\/slack\// });
    expect(test1.body).toMatchObject({ text: "Omakaze is connected to Acme" });
    expect(JSON.stringify(test1.body)).toContain("Test message sent by Maya Chen");
    await caption(page, "Send test message posts to the channel right away", "Slack");
    await pause(page, 1200);
    await slack.getByLabel("Incoming webhook URL").fill(mockNotify.slackUrl);
    await slack.getByRole("button", { name: "Save" }).click();
    await expect(slack.getByRole("status")).toHaveText("Saved.");
    await expect(slack).toContainText("http://127.0.0.1:");
    await expect(slack).toContainText("/slack/T0E2E0000/B0E2E0000/…");
    await expect(slack).not.toContainText("e2eSlackWebhookSecret");
    // Encrypted at rest.
    const [channel] = await sql()`select url_enc, events from notification_channels where kind = 'slack' and workspace_id = ${await workspaceId()}`;
    expect(channel.url_enc).toMatch(/^v1:/);
    expect(channel.url_enc).not.toContain("e2eSlackWebhookSecret");
    expect(channel.events).toEqual(["guide_published", "new_version", "review_submitted"]);

    // The preview renders the Block Kit message for each event.
    const preview = page.getByRole("figure", { name: "Slack message preview" });
    await preview.scrollIntoViewIfNeeded();
    await preview.getByRole("tab", { name: "New version" }).click();
    await expect(preview).toContainText("Version 2 of the guide for acme/storefront #");
    await expect(preview.getByRole("link", { name: "Open the guide" })).toBeVisible();
    await caption(page, "The preview renders the Block Kit message, with a link back to the guide", "Slack preview");
    await shot(page, "02-slack-settings-and-preview", { locator: slack });
    await pause(page, 2000);

    // Maya publishes a guide for #131, where Alex and Sam are requested reviewers.
    await caption(page, "Maya publishes a guide for #131 (Alex and Sam are requested reviewers)", "Guide published");
    const guide = await publish(request, "admin", DEMO_PRS.noGuide, [
      { title: "Resizer URLs", body: "`imageUrl` builds a CDN resizer URL per size.", refs: ["src/lib/images.ts"] },
      { title: "Allowing the CDN host", body: "`next/image` may load from the resizer.", refs: ["next.config.ts"] },
    ]);
    await expect.poll(async () => (await mockNotify.hooks({ path: /^\/slack\// })).length, { timeout: 30_000 }).toBe(2);
    const published = (await mockNotify.hooks({ path: /^\/slack\// }))[1];
    expect(published.body).toMatchObject({ text: "Guide ready for acme/storefront #131: Serve product images through the CDN resizer" });
    expect(JSON.stringify(published.body)).toContain(`${E2E.appUrl}/w/demo/acme/storefront/pull/131?v=1`);

    const [sam] = await inbox("member");
    const [alex] = await inbox("owner");
    expect(sam.subject).toBe("Guide ready to review: #131 Serve product images through the CDN resizer");
    expect(alex.subject).toBe(sam.subject);
    expect(sam.text).toContain("Maya Chen published a guide with 2 sections. Your review is requested.");
    expect(sam.html).toContain(`href="${E2E.appUrl}/w/demo/acme/storefront/pull/131?v=1"`);
    expect(sam.headers["list-unsubscribe"]).toMatch(new RegExp(`^<${E2E.appUrl}/api/notifications/unsubscribe\\?token=`));
    expect(sam.headers["list-unsubscribe-post"]).toBe("List-Unsubscribe=One-Click");
    // Never the person who caused it.
    expect(await notified(`guide:${guide.id}`)).toEqual(["owner:guide_ready", "member:guide_ready"]);

    await page.goto(mockNotify.mailUrl(sam.id));
    await expect(page.frameLocator("#body").getByText("Serve product images through the CDN resizer")).toBeVisible();
    await caption(page, "Sam gets an email: the guide is ready for his review", "Email");
    await shot(page, "03-email-guide-ready", { fullPage: true });
    await pause(page, 2500);

    // Sam replies twice to Alex's comment on #128; Alex gets one email for both.
    await loginAs("member");
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 5 }));
    const thread = page.getByRole("row", { name: /Could the preview route set this cookie instead\?/ });
    await thread.scrollIntoViewIfNeeded();
    await caption(page, "Sam replies to Alex's comment, twice in a row", "Replies");
    await pause(page, 1200);
    for (const text of ["Good call. The preview route can set it with httpOnly.", "Pushed that: the client no longer writes the cookie."]) {
      await thread.getByRole("button", { name: "Reply…" }).click();
      await page.getByPlaceholder("Reply").fill(text);
      // The reply shows before it is posted; its notification is queued when the POST returns.
      const posted = page.waitForResponse((r) => r.request().method() === "POST" && /^\/api\/guides\/[^/]+\/comments$/.test(new URL(r.url()).pathname));
      await page.getByRole("button", { name: "Reply on GitHub" }).click();
      expect((await posted).ok()).toBe(true);
      await expect(page.getByText(text)).toBeVisible();
    }
    const alexMail = await inbox("owner", 2);
    const grouped = alexMail[1];
    expect(grouped.subject).toBe("2 updates on #128 Apply promo codes at checkout");
    expect(grouped.text).toContain("Sam Okafor replied to your comment on src/components/checkout/PromoCodeField.tsx");
    expect(grouped.text).toContain("> Good call. The preview route can set it with httpOnly.");
    expect(grouped.text).toContain("> Pushed that: the client no longer writes the cookie.");
    expect(grouped.text).toContain(`${E2E.appUrl}/w/demo/acme/storefront/pull/128?section=5`);
    // Maya opened #128, so she hears about comments in its guide; Sam wrote them.
    const maya = await inbox("admin");
    expect(maya.map((m) => m.subject)).toEqual(["2 updates on #128 Apply promo codes at checkout"]);
    expect(maya[0].text).toContain("Sam Okafor replied on src/components/checkout/PromoCodeField.tsx");
    expect((await mockNotify.mail({ to: DEMO_USERS.member.email })).length).toBe(1);

    await page.goto(mockNotify.mailUrl(grouped.id));
    await expect(page.frameLocator("#body").getByText("Pushed that: the client no longer writes the cookie.")).toBeVisible();
    await caption(page, "A burst of events becomes one email", "Grouped");
    await shot(page, "04-email-replies-grouped", { fullPage: true });
    await pause(page, 2500);
    await caption(page);
  });

  test("a new version tells each reviewer which of their sections changed", async ({ page, request }) => {
    test.setTimeout(E2E.demo ? 300_000 : 180_000);
    // A JSON webhook next to Slack, signed with the secret the settings show.
    await page.goto(`${demoPaths.settings}/notifications`);
    const hook = panel(page, "JSON webhook");
    await hook.getByLabel("Webhook URL").fill(`${mockNotify.url}/hooks/omakaze`);
    await hook.getByRole("button", { name: "Save" }).click();
    await expect(hook.getByRole("status")).toHaveText("Saved.");
    const secret = await hook.getByLabel("Signing secret").inputValue();
    expect(secret).toMatch(/^whsec_/);

    // Alex publishes version 3 of #128, where "Validating a code" now covers different code.
    const sections = await versionThreeSections(request);
    const v3 = await publish(request, "owner", DEMO_PRS.main, sections);
    expect(v3.version).toBe(3);

    await expect.poll(async () => (await mockNotify.hooks({ path: "/hooks/omakaze" })).length, { timeout: 30_000 }).toBe(1);
    const [delivery] = await mockNotify.hooks({ path: "/hooks/omakaze" });
    expect(delivery.headers["x-omakaze-event"]).toBe("new_version");
    expect(delivery.headers["x-omakaze-signature-256"]).toBe(`sha256=${createHmac("sha256", secret).update(JSON.stringify(delivery.body)).digest("hex")}`);
    expect(delivery.body).toMatchObject({
      event: "new_version",
      repository: "acme/storefront",
      pull_request: { number: 128, title: "Apply promo codes at checkout", author: "mayachen" },
      // promo.ts left "Validating a code", so "Other changes" picked it up.
      guide: { version: 3, changed_sections: ["Validating a code", "Other changes"], new_sections: 0 },
      actor: "Alex Morgan",
    });

    // Maya and Sam reviewed earlier versions; Alex published it.
    expect(await notified(`guide:${v3.id}`)).toEqual(["admin:new_version", "member:new_version"]);
    const [maya] = await inbox("admin");
    expect(maya.subject).toBe("Version 3 of #128 Apply promo codes at checkout: 1 section you reviewed changed");
    expect(maya.text).toContain("Alex Morgan published version 3 of the guide.");
    expect(maya.text).toContain(`  * Validating a code: ${E2E.appUrl}/w/demo/acme/storefront/pull/128?v=3&section=2`);
    expect(maya.text).toContain("2 sections you reviewed are unchanged; your marks carried over.");
    const [sam] = await inbox("member");
    expect(sam.subject).toBe("Version 3 of #128 Apply promo codes at checkout: 1 section you reviewed changed");
    expect(sam.text).toContain("  * Checkout endpoint: ");
    expect(sam.text).toContain("1 section you reviewed is unchanged; your marks carried over.");

    await page.goto(mockNotify.mailUrl(maya.id));
    await expect(page.frameLocator("#body").getByText("Changed since you reviewed")).toBeVisible();
    await shot(page, "05-email-new-version", { fullPage: true });
  });

  test("replies and reviews on GitHub arrive through webhooks", async ({ page }) => {
    await connectSlack(page);
    const pull = await onGitHub("admin", "GET", `/pulls/${DEMO_PRS.main}`);

    // Maya replies on GitHub to Sam's comment on cart.ts.
    const reply = await onGitHub("admin", "POST", `/pulls/${DEMO_PRS.main}/comments/2001005/replies`, { body: "Added a comment that explains the guard." });
    await sendWebhook("pull_request_review_comment", { action: "created", comment: reply, pull_request: pull, repository });
    // GitHub can deliver an event twice; it is one notification.
    await sendWebhook("pull_request_review_comment", { action: "created", comment: reply, pull_request: pull, repository });
    const [sam] = await inbox("member");
    expect(sam.subject).toBe("Maya Chen replied to your comment on #128");
    expect(sam.text).toContain("> Added a comment that explains the guard.");
    // The section that covers src/lib/cart.ts.
    expect(sam.text).toContain(`${E2E.appUrl}/w/demo/acme/storefront/pull/128?section=3`);
    expect(await notified(`comment:%:${reply.id}`)).toEqual(["member:reply"]);

    // Alex approves on GitHub: Slack hears about the completed review.
    await sendWebhook("pull_request_review", {
      action: "submitted",
      review: { id: 5_100_001, user: { login: "alexmorgan" }, body: "Ship it.", state: "approved", html_url: `${DEMO_REPO.htmlUrl}/pull/128#pullrequestreview-5100001` },
      pull_request: pull,
      repository,
    });
    await expect.poll(async () => (await mockNotify.hooks({ path: /^\/slack\// })).length, { timeout: 30_000 }).toBe(1);
    const [approved] = await mockNotify.hooks({ path: /^\/slack\// });
    expect(approved.body).toMatchObject({ text: "Alex Morgan approved acme/storefront #128: Apply promo codes at checkout" });
    expect(JSON.stringify(approved.body)).toContain("> Ship it.");

    // A webhook Slack refuses is reported in the settings and not retried.
    await mockNotify.failHooks(404, 1);
    await page.reload();
    const slack = panel(page, "Slack");
    await slack.getByRole("button", { name: "Send test message" }).click();
    await expect(slack.getByRole("alert")).toHaveText("Slack didn't accept the test message: HTTP 404: no_service");
  });

  test("preferences, muting a workspace and unsubscribing", async ({ page, request, loginAs }) => {
    test.setTimeout(E2E.demo ? 300_000 : 150_000);
    await loginAs("owner");
    await page.goto(`${demoPaths.account}#notifications`);
    const prefs = panel(page, "Notifications");
    await expect(prefs).toContainText(`Emails go to ${DEMO_USERS.owner.email}.`);
    await unstickHeader(page);
    await shot(page, "01-account-notifications", { locator: prefs });
    await prefs.getByLabel("Replies to my comments").uncheck();
    await prefs.getByLabel("At most once an hour").check();
    await prefs.getByRole("button", { name: "Save notifications" }).click();
    await expect(prefs.getByRole("status")).toHaveText("Saved.");
    const [row] = await sql()`select replies, digest, email from notification_preferences where user_id = ${await userId("owner")}`;
    expect(row).toEqual({ replies: false, digest: "hourly", email: true });

    // Muting the workspace from its settings stops its email.
    await page.goto(`${demoPaths.settings}/notifications`);
    const mine = panel(page, "Your email");
    await mine.getByLabel("Email me about Acme").uncheck();
    await mine.getByRole("button", { name: "Save" }).click();
    await expect(mine.getByRole("status")).toHaveText("Muted. You won't get email about Acme.");
    await publish(request, "admin", DEMO_PRS.noGuide, [{ title: "Resizer URLs", refs: ["src/lib/images.ts", "next.config.ts"] }]);
    const [sam] = await inbox("member");
    expect(await notified("guide:%")).toEqual(["member:guide_ready"]);

    // Unsubscribe links in the email: one for the workspace, one for everything.
    const links = [...sam.html!.matchAll(/href="([^"]+\/unsubscribe\?token=[^"]+)"[^>]*>([^<]+)</g)].map((m) => ({ url: m[1].replace(/&amp;/g, "&"), label: m[2] }));
    expect(links.map((l) => l.label)).toEqual(["Mute Acme", "Unsubscribe"]);
    // The links work signed out.
    await page.context().clearCookies();
    await page.goto(links[1].url);
    await expect(page.getByRole("heading", { name: "Unsubscribe from Omakaze email?" })).toBeVisible();
    await expect(page.getByText(`${DEMO_USERS.member.email} won't get any notification email.`)).toBeVisible();
    await shot(page, "06-unsubscribe");
    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("status")).toHaveText("Done. You won't get notification email from Omakaze anymore.");
    const [unsub] = await sql()`select email from notification_preferences where user_id = ${await userId("member")}`;
    expect(unsub.email).toBe(false);

    await page.goto(links[0].url);
    await expect(page.getByRole("heading", { name: "Stop email about Acme?" })).toBeVisible();
    await page.getByRole("button", { name: "Mute Acme" }).click();
    await expect(page.getByRole("status")).toHaveText("Done. You won't get email about this workspace anymore.");
    expect((await sql()`select 1 from notification_mutes where user_id = ${await userId("member")}`).length).toBe(1);

    // One-click unsubscribe (RFC 8058) from the List-Unsubscribe header; a forged token is refused.
    await sql()`delete from notification_preferences where user_id = ${await userId("member")}`;
    const oneClick = /^<(.+)>$/.exec(sam.headers["list-unsubscribe"])![1];
    const res = await request.post(oneClick, { form: { "List-Unsubscribe": "One-Click" } });
    expect(res.status()).toBe(200);
    expect((await sql()`select email from notification_preferences where user_id = ${await userId("member")}`)[0].email).toBe(false);
    expect((await request.post(`${oneClick.replace(/\.[^.]+$/, "")}.forged`, { form: { "List-Unsubscribe": "One-Click" } })).status()).toBe(400);
  });

  test("settings on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectSlack(page);
    await page.reload();
    await expect(panel(page, "Slack")).toContainText("Posting to");
    await unstickHeader(page);
    await shot(page, "07-mobile-slack-settings", { locator: panel(page, "Slack") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.goto(`${demoPaths.account}#notifications`);
    await expect(panel(page, "Notifications")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("Notifications without SMTP", () => {
  test.skip(E2E.smtp !== "none", "runs with E2E_SMTP=none");

  test("the settings say why email is off", async ({ page }) => {
    await page.goto(`${demoPaths.account}#notifications`);
    const prefs = panel(page, "Notifications");
    await expect(prefs).toContainText("Email notifications are off: this instance has no SMTP server configured.");
    await expect(prefs.getByRole("button", { name: "Save notifications" })).toBeDisabled();
    await unstickHeader(page);
    await shot(page, "08-account-without-smtp", { locator: prefs });
  });
});
