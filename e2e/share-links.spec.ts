import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { request as playwrightRequest, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import { DEMO_SHARE } from "../scripts/demo-data/share-links";
import { guideId, sql } from "./db";
import { DEMO_OVERLAY } from "./demo-overlay";
import { DEMO_PRS, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { caption, pause, saveVideo, shot } from "./media";

const PROMO = "src/lib/promo.ts";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** A browser without a session, as someone outside the workspace opens a link. */
async function signedOutPage(browser: Browser, opts: { width?: number; record?: boolean } = {}): Promise<Page> {
  const width = opts.width ?? 1440;
  const height = width < 800 ? 844 : 900;
  const context = await browser.newContext({
    baseURL: E2E.appUrl,
    viewport: { width, height },
    deviceScaleFactor: E2E.scale,
    storageState: { cookies: [], origins: [] },
    recordVideo: E2E.mediaDir && opts.record ? { dir: test.info().outputPath("viewer"), size: { width, height } } : undefined,
  });
  const page = await context.newPage();
  if (E2E.demo) await page.addInitScript(DEMO_OVERLAY);
  return page;
}

/** An API client without a session, from its own client address (the share rate limits count per address). */
async function anonymousApi(): Promise<APIRequestContext> {
  const address = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  return playwrightRequest.newContext({ baseURL: E2E.appUrl, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": address } });
}

/** A share link written straight to the database, as createShareLink stores it. Returns its token. */
async function insertLink(opts: { pr: number; version?: number; comments?: boolean; expiresAt?: Date | null; revokedAt?: Date | null }): Promise<string> {
  const id = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const [ws] = await sql()`select w.id as workspace_id, r.id as repository_id from workspaces w join repositories r on r.workspace_id = w.id where w.slug = 'demo'`;
  await sql()`
    insert into share_links (id, workspace_id, repository_id, pr_number, guide_id, secret_hash, include_comments, expires_at, revoked_at)
    values (${id}, ${ws.workspace_id}, ${ws.repository_id}, ${opts.pr}, ${opts.version ? await guideId(opts.pr, opts.version) : null}, ${sha256(secret)},
      ${opts.comments ?? false}, ${opts.expiresAt ?? null}, ${opts.revokedAt ?? null})`;
  return `${id}${secret}`;
}

/**
 * In demo recordings, a title card for one part of the walk-through. It stays on screen while the
 * next page loads, instead of a blank frame.
 */
async function titleCard(page: Page, step: string, title: string): Promise<void> {
  if (!E2E.demo) return;
  await page.setContent(`<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#fcfcfc;font-family:Georgia,serif">
    <div style="text-align:center"><p style="font:12px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(0,0,0,.55);border:1px dashed rgba(0,0,0,.25);display:inline-block;padding:6px 10px">Share links · ${step}</p>
    <h1 style="font-weight:400;font-size:44px;letter-spacing:-.03em;color:#000;margin:24px 0 0">${title}</h1></div></body>`);
  await pause(page, 1600);
}

/** Scroll an element into the middle of its pane, without scrolling the page itself. */
async function reveal(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
    window.scrollTo(0, 0);
  });
}

async function guideViews(): Promise<number> {
  const [row] = await sql()`select count(*)::int as n from guide_views`;
  return row.n as number;
}

test.describe("Share links", () => {
  test.beforeEach(() => mockGitHub.clear());
  // Leave the demo as it was: only its own link, unchanged, and the default settings.
  test.afterEach(async () => {
    await sql()`delete from share_links where id <> ${DEMO_SHARE.id}`;
    await sql()`update share_links set revoked_at = null where id = ${DEMO_SHARE.id}`;
    await sql()`delete from activity where type like 'share.%' and created_at > now() - interval '1 hour'`;
    await sql()`delete from activity where type = 'settings.updated' and data->>'section' = 'share link'`;
    await sql()`update workspaces set share_links_enabled = true, share_link_role = 'admin' where slug = 'demo'`;
  });

  test("shares a guide with a read-only link and revokes it", async ({ context, browser }) => {
    test.slow();
    // Each part of the walk-through is its own page, so the recordings join into one video in order.
    if (E2E.demo) await context.addInitScript(DEMO_OVERLAY);
    const recordings: string[] = [];
    const done = async (p: Page, name: string) => recordings.push(...(await saveVideo(p, name)).filter((f) => f.endsWith(".webm")));
    const page = await context.newPage();
    await titleCard(page, "1 / 4", "A member creates a read-only link");
    const started = new Date();
    const v2 = await guideId(DEMO_PRS.main, 2);
    const viewsBefore = await guideViews();

    // Create a link to this version, with GitHub's review comments.
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
    await caption(page, "Share a guide with someone outside the workspace", "Share links");
    await pause(page, 1200);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share a read-only link" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /This version \(v2\)/ })).toBeChecked();
    await expect(dialog.getByRole("list", { name: "Active share links" })).toHaveCount(0);
    await dialog.getByLabel("Expires").selectOption("7");
    await dialog.getByLabel("Include review comments from GitHub").check();
    await caption(page, "This version or always the latest, an expiry, and optionally GitHub's comments", "Share links");
    await shot(page, "share-dialog");
    await pause(page, 1500);
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(dialog.getByRole("status")).toContainText("Copy it now");
    const url = (await dialog.locator("[data-share-url]").textContent())!.trim();
    expect(url).toMatch(new RegExp(`^${E2E.appUrl}/s/[A-Za-z0-9_-]{59}$`));
    const token = url.split("/s/")[1];
    await expect(dialog.locator("[data-share-link]")).toHaveCount(1);
    await expect(dialog.locator("[data-share-link]")).toContainText("v2");
    await expect(dialog.locator("[data-share-link]")).toContainText("With comments");
    await caption(page, "The link is shown once; only a hash of its secret is stored", "Share links");
    await shot(page, "share-dialog-created", { locator: dialog });
    await pause(page, 1500);

    // Only the secret's hash is stored, and the activity log records who created it.
    const [row] = await sql()`select * from share_links where id = ${token.slice(0, 16)}`;
    expect(row.secret_hash).toBe(sha256(token.slice(16)));
    expect(JSON.stringify(row)).not.toContain(token.slice(16));
    expect(row.guide_id).toBe(v2);
    expect(row.include_comments).toBe(true);
    expect(new Date(row.expires_at).getTime() - started.getTime()).toBeGreaterThan(6.9 * 24 * 3600_000);
    const [logEntry] = await sql()`select a.data, u.email from activity a join users u on u.id = a.actor_user_id where a.type = 'share.created' and a.created_at >= ${started}`;
    expect(logEntry).toMatchObject({ email: DEMO_USERS.owner.email, data: { version: 2, comments: true } });
    await page.keyboard.press("Escape");
    await done(page, "share-links-1-create");

    // Someone without an account opens it in a fresh browser.
    const viewer = await signedOutPage(browser, { record: true });
    await titleCard(viewer, "2 / 4", "Someone without an account opens it");
    await viewer.goto(url);
    await expect(viewer.getByText("Shared, read-only view of")).toBeVisible();
    await expect(viewer.locator("header")).toContainText("acme/storefront#128");
    await expect(viewer.getByText("Guided PR · v2")).toBeVisible();
    await caption(viewer, "Signed out: the guide opens read-only, without the workspace", "Shared view");
    await shot(viewer, "shared-guide-overview");
    await pause(viewer, 1500);
    // No member tools, names or review progress.
    for (const name of ["Edit", "Regenerate", "Copy agent prompt", "Share", "Finish review"]) {
      await expect(viewer.getByRole("button", { name, exact: true })).toHaveCount(0);
      await expect(viewer.getByRole("link", { name, exact: true })).toHaveCount(0);
    }
    await expect(viewer.getByRole("combobox", { name: "Guide version" })).toHaveCount(0);
    await expect(viewer.getByText(/\d+\/\d+ reviewed/)).toHaveCount(0);
    await expect(viewer.getByRole("group", { name: "Your review progress" })).toHaveCount(0);

    // Sections, diffs and context expansion work.
    const steps = viewer.getByRole("navigation", { name: "Guide sections" });
    await steps.getByRole("button", { name: /Promo codes table/ }).click();
    await expect(viewer.getByText("Section 01 / 06")).toBeVisible();
    await expect(viewer.locator('.diff-file[data-path="db/migrations/0018_promo_codes.sql"]')).toContainText('CREATE TABLE "promo_codes"');
    await expect(viewer.getByRole("button", { name: /Mark reviewed/ })).toHaveCount(0);
    await caption(viewer, "Sections and their code, as members see them", "Shared view");
    await pause(viewer);
    const schema = viewer.locator('.diff-file[data-path="src/db/schema.ts"]');
    const rows = schema.locator("tr.diff-row");
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    const expand = schema.locator(".diff-expand").filter({ hasText: /unchanged line/ }).first();
    await reveal(expand);
    await expand.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
    await caption(viewer, "Unchanged lines around the changes load through the link too", "Shared view");
    await pause(viewer);
    await viewer.getByRole("button", { name: "Continue to section 02" }).click();
    await expect(viewer.getByText("Section 02 / 06")).toBeVisible();
    const promo = viewer.locator(`.diff-file[data-path="${PROMO}"]`);

    // GitHub's comments are shown read-only: no replies, resolving, new comments or committing suggestions.
    const sam = promo.locator("[data-thread]").filter({ hasText: "Copy nit" });
    await expect(sam.locator("[data-suggestion] tr.row-add")).toHaveText(/Add a little more to your cart to use this code/);
    await expect(viewer.locator("figure.md-mermaid .mermaid-light svg")).toBeVisible();
    await reveal(sam);
    await expect(sam.getByRole("button", { name: "Reply…" })).toHaveCount(0);
    await expect(sam.getByRole("button", { name: "Resolve conversation" })).toHaveCount(0);
    await expect(sam.getByRole("link", { name: /Commit/ })).toHaveCount(0);
    await expect(promo.getByRole("button", { name: "Comment on this line" })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: /Show resolved/ })).toHaveCount(0);
    await caption(viewer, "Review comments from GitHub, read-only, when the link includes them", "Shared view");
    await shot(viewer, "shared-guide-section-comments");
    await pause(viewer, 1500);

    // Moved code links to where it came from.
    await viewer.keyboard.press("ArrowRight");
    await expect(viewer.getByText("Section 03 / 06")).toBeVisible();
    const moved = viewer.getByRole("button", { name: /Moved from/ }).first();
    await expect(moved).toBeVisible();
    await reveal(moved);
    await caption(viewer, "Moved blocks and every changed file are there too", "Shared view");
    await shot(viewer, "shared-guide-moved-code");
    await pause(viewer, 1200);
    await viewer.getByRole("button", { name: "All files" }).click();
    await expect(viewer.getByRole("heading", { name: "Every change in the pull request." })).toBeVisible();
    await pause(viewer, 1200);

    // Nothing was written to GitHub or recorded as a visit, and no member name or address is on the page.
    const writes = (await mockGitHub.requests()).filter(
      (r) => r.method !== "GET" && !(r.path === "/graphql" && !/\bmutation\b/.test((r.body as { query?: string }).query ?? "")),
    );
    expect(writes).toEqual([]);
    expect(await guideViews()).toBe(viewsBefore);
    const html = await viewer.content();
    for (const u of Object.values(DEMO_USERS)) {
      expect(html).not.toContain(u.name);
      expect(html).not.toContain(u.email);
    }

    await done(viewer, "share-links-2-shared-view");

    // The link appears in the workspace settings, with when it was last opened. Revoke it there.
    const settings = await context.newPage();
    await titleCard(settings, "3 / 4", "The member revokes it in Settings");
    await settings.goto(`${demoPaths.settings}/sharing`);
    const item = settings.locator(`[data-share-link="${token.slice(0, 16)}"]`);
    await expect(item).toContainText("acme/storefront#128");
    await expect(item).toContainText("v2");
    await expect(item).toContainText("Alex Morgan");
    await expect(item).toContainText(/last opened (just now|\d+ minutes? ago)/);
    await expect(settings.locator(`[data-share-link="${DEMO_SHARE.id}"]`)).toContainText("Latest version");
    await caption(settings, "Settings → Share links lists every active link", "Settings");
    await shot(settings, "share-links-settings", { fullPage: true });
    await pause(settings, 1500);
    settings.once("dialog", (d) => d.accept());
    await item.getByRole("button", { name: "Revoke" }).click();
    await expect(item).toHaveCount(0);
    const [revoked] = await sql()`select revoked_at from share_links where id = ${token.slice(0, 16)}`;
    expect(revoked.revoked_at).not.toBeNull();
    const logged = await sql()`select type, data from activity where type like 'share.%' and created_at >= ${started} order by created_at`;
    expect(logged.map((r) => r.type)).toEqual(["share.created", "share.revoked"]);
    expect(logged[1].data).toMatchObject({ version: 2 });
    await caption(settings, "Revoking a link stops it at once", "Settings");
    await pause(settings, 1200);
    await done(settings, "share-links-3-settings");

    // The link stops working at once, for the page and for its file views.
    const again = await viewer.context().newPage();
    if (E2E.demo) await again.addInitScript(DEMO_OVERLAY);
    await titleCard(again, "4 / 4", "The link no longer opens");
    await again.goto(url);
    await expect(again.locator('[data-share-state="revoked"]')).toBeVisible();
    await expect(again.getByRole("heading", { name: "This link was revoked." })).toBeVisible();
    const res = await again.request.get(`/api/guides/${v2}/file?path=${encodeURIComponent(PROMO)}&share=${token}`);
    expect(res.status()).toBe(404);
    await caption(again, "Whoever has the link now sees that it was revoked", "Revoked");
    await shot(again, "share-link-revoked");
    await pause(again, 1800);
    await done(again, "share-links-4-revoked");
    await viewer.context().close();

    // One video of the whole walk-through.
    if (recordings.length === 4) {
      execFileSync("ffmpeg", [
        ...["-y", "-loglevel", "error"],
        ...recordings.flatMap((f) => ["-i", f]),
        ...["-filter_complex", `${recordings.map((_, i) => `[${i}:v]`).join("")}concat=n=${recordings.length}:v=1:a=0[out]`, "-map", "[out]"],
        ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        path.join(E2E.mediaDir!, "share-links-walkthrough.mp4"),
      ]);
    }
  });

  test("a share token opens only its own guide and the uploads it shows", async () => {
    test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");
    const api = await anonymousApi();
    const token = DEMO_SHARE.token;
    const g127 = await guideId(DEMO_PRS.merged, 1);
    const g128 = await guideId(DEMO_PRS.main, 2);
    const file127 = encodeURIComponent("src/lib/email/order-confirmation.ts");

    // The link's own guide: file views and status, without a session. Not cached, not indexed.
    const ok = await api.get(`/api/guides/${g127}/file?path=${file127}&share=${token}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toBe("no-store");
    expect(ok.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect((await ok.json()).path).toBe("src/lib/email/order-confirmation.ts");
    expect((await api.get(`/api/guides/${g127}/status?share=${token}`)).status()).toBe(200);
    // Not without the token, and nothing else with it.
    expect((await api.get(`/api/guides/${g127}/file?path=${file127}`)).status()).toBe(401);
    expect((await api.get(`/api/guides/${g128}/file?path=${encodeURIComponent(PROMO)}&share=${token}`)).status()).toBe(404);
    expect((await api.get(`/api/guides/${g128}/status?share=${token}`)).status()).toBe(404);
    expect((await api.get(`/api/guides/${g127}/comments?share=${token}`)).status()).toBe(404);
    expect((await api.post(`/api/guides/${g127}/progress?share=${token}`, { data: { sectionId: "x", reviewed: true } })).status()).toBe(401);
    expect((await api.get(`/api/w/demo/latest-guide?number=127&share=${token}`)).status()).toBe(401);

    // Uploads: one shown by #127's guide, one only by #128's. The link serves the first only.
    const [ws] = await sql()`select id from workspaces where slug = 'demo'`;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const shown = `e2eshare${randomBytes(4).toString("hex")}`;
    const other = `e2eother${randomBytes(4).toString("hex")}`;
    for (const [id, guide] of [[shown, g127], [other, g128]]) {
      await sql()`insert into assets (id, workspace_id, guide_id, filename, content_type, size, storage) values (${id}, ${ws.id}, ${guide}, 'shot.png', 'image/png', ${png.length}, 'database')`;
      await sql()`insert into asset_blobs (asset_id, data) values (${id}, ${png})`;
    }
    const [section] = await sql()`select id, body from guide_sections where guide_id = ${g127} and position = 1`;
    const [section128] = await sql()`select id, body from guide_sections where guide_id = ${g128} and position = 1`;
    try {
      await sql()`update guide_sections set body = ${`${section.body}\n\n![The email](${E2E.appUrl}/api/assets/${shown}/shot.png)`} where id = ${section.id}`;
      await sql()`update guide_sections set body = ${`${section128.body}\n\n![Other](${E2E.appUrl}/api/assets/${other}/shot.png)`} where id = ${section128.id}`;
      const asset = await api.get(`/api/assets/${shown}/shot.png?share=${token}`);
      expect(asset.status()).toBe(200);
      expect(asset.headers()["content-type"]).toBe("image/png");
      expect((await api.get(`/api/assets/${other}/shot.png?share=${token}`)).status()).toBe(404);
      expect((await api.get(`/api/assets/${shown}/shot.png`)).status()).toBe(401);
      const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
      expect((await api.get(`/api/assets/${shown}/shot.png?share=${wrong}`)).status()).toBe(404);
    } finally {
      await sql()`update guide_sections set body = ${section.body} where id = ${section.id}`;
      await sql()`update guide_sections set body = ${section128.body} where id = ${section128.id}`;
      await sql()`delete from assets where id in (${shown}, ${other})`;
      await api.dispose();
    }
  });

  test("a version link stays on its version; a latest link offers every published one", async ({ browser }) => {
    const fixed = await insertLink({ pr: DEMO_PRS.main, version: 2 });
    const latest = await insertLink({ pr: DEMO_PRS.main });
    const api = await anonymousApi();
    const v1 = await guideId(DEMO_PRS.main, 1);
    const v2 = await guideId(DEMO_PRS.main, 2);
    const file = encodeURIComponent(PROMO);
    expect((await api.get(`/api/guides/${v2}/file?path=${file}&share=${fixed}`)).status()).toBe(200);
    expect((await api.get(`/api/guides/${v1}/file?path=${file}&share=${fixed}`)).status()).toBe(404);
    expect((await api.get(`/api/guides/${v1}/file?path=${file}&share=${latest}`)).status()).toBe(200);
    // Without comments in the link, the comments route stays closed.
    expect((await api.get(`/api/guides/${v2}/comments?share=${latest}`)).status()).toBe(404);
    await api.dispose();

    const viewer = await signedOutPage(browser);
    const commentRequests: string[] = [];
    viewer.on("request", (r) => r.url().includes("/comments") && commentRequests.push(r.url()));
    // ?v= is ignored for a version link.
    await viewer.goto(`/s/${fixed}?v=1`);
    await expect(viewer.getByText("Guided PR · v2")).toBeVisible();
    await expect(viewer.getByRole("combobox", { name: "Guide version" })).toHaveCount(0);

    await viewer.goto(`/s/${latest}?section=2`);
    await expect(viewer.getByText("Section 02 / 06")).toBeVisible();
    const select = viewer.getByRole("combobox", { name: "Guide version" });
    await expect(select.locator("option")).toHaveText([/^v2/, /^v1/]);
    await expect(viewer.locator(`.diff-file[data-path="${PROMO}"]`)).toBeVisible();
    await expect(viewer.locator("[data-thread]")).toHaveCount(0);
    await select.selectOption("1");
    await expect(viewer).toHaveURL(/\?v=1/);
    await expect(viewer.getByText("Guided PR · v1")).toBeVisible();
    await expect(viewer.getByText("This guide covers")).toBeVisible();
    expect(commentRequests).toEqual([]);
    await viewer.context().close();
  });

  test("expired, revoked, invalid and turned-off links show why they don't open", async ({ browser }) => {
    const viewer = await signedOutPage(browser);
    const expired = await insertLink({ pr: DEMO_PRS.main, expiresAt: new Date(Date.now() - 60_000) });
    const revoked = await insertLink({ pr: DEMO_PRS.main, revokedAt: new Date() });

    await viewer.goto(`/s/${expired}`);
    await expect(viewer.getByRole("heading", { name: "This link has expired." })).toBeVisible();
    await shot(viewer, "share-link-expired");
    await viewer.goto(`/s/${revoked}`);
    await expect(viewer.getByRole("heading", { name: "This link was revoked." })).toBeVisible();
    await viewer.goto(`/s/${DEMO_SHARE.token.slice(0, -2)}xy`);
    await expect(viewer.getByRole("heading", { name: "This link is not valid." })).toBeVisible();

    // The page is never indexed and its address is never sent as a referrer.
    const res = await viewer.goto(`/s/${DEMO_SHARE.token}`);
    expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(res!.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(viewer.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(viewer.getByText("Shared, read-only view of")).toBeVisible();

    // Turning share links off in the workspace stops every link without revoking it.
    await sql()`update workspaces set share_links_enabled = false where slug = 'demo'`;
    await viewer.reload();
    await expect(viewer.getByRole("heading", { name: "Sharing is turned off." })).toBeVisible();
    const g127 = await guideId(DEMO_PRS.merged, 1);
    expect((await viewer.request.get(`/api/guides/${g127}/status?share=${DEMO_SHARE.token}`)).status()).toBe(404);
    await viewer.context().close();
  });

  test("rate limits failed lookups per client address", async () => {
    const api = await anonymousApi();
    const g127 = await guideId(DEMO_PRS.merged, 1);
    for (let i = 0; i < 30; i++) {
      const bad = `${DEMO_SHARE.id}${randomBytes(32).toString("base64url")}`;
      expect((await api.get(`/api/guides/${g127}/status?share=${bad}`)).status()).toBe(404);
    }
    // After 30 misses, even the right token is refused from this address, and the page says so.
    expect((await api.get(`/api/guides/${g127}/status?share=${DEMO_SHARE.token}`)).status()).toBe(429);
    expect(await (await api.get(`/s/${DEMO_SHARE.token}`)).text()).toContain("Too many attempts.");
    await api.dispose();
    const fresh = await anonymousApi();
    expect((await fresh.get(`/api/guides/${g127}/status?share=${DEMO_SHARE.token}`)).status()).toBe(200);
    await fresh.dispose();
  });

  test.describe("as a member", () => {
    test.use({ user: "member" });

    test("creates links when the workspace allows members to", async ({ page, loginAs }) => {
      await page.goto(demoPaths.pull(DEMO_PRS.main));
      await page.getByRole("button", { name: "Share", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Share a read-only link" });
      await expect(dialog).toContainText("Only admins and owners can create share links in this workspace.");
      await expect(dialog.getByRole("button", { name: "Create link" })).toHaveCount(0);

      // An owner allows every member.
      await loginAs("owner");
      await page.goto(`${demoPaths.settings}/sharing`);
      await page.getByLabel("Who can create links").selectOption("member");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("status")).toContainText("Saved.");

      await loginAs("member");
      await page.goto(demoPaths.pull(DEMO_PRS.main));
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await dialog.getByRole("radio", { name: "Latest version" }).check();
      await dialog.getByLabel("Expires").selectOption("1");
      await dialog.getByRole("button", { name: "Create link" }).click();
      await expect(dialog.locator("[data-share-url]")).toBeVisible();
      const mine = dialog.locator("[data-share-link]");
      await expect(mine).toContainText("Latest version");
      await expect(mine).toContainText("Sam Okafor");
      await expect(mine.getByRole("button", { name: "Revoke" })).toBeVisible();
      const [row] = await sql()`select guide_id, expires_at from share_links where id <> ${DEMO_SHARE.id}`;
      expect(row.guide_id).toBeNull();
      expect(new Date(row.expires_at).getTime() - Date.now()).toBeLessThan(24 * 3600_000 + 60_000);

      // Members revoke only their own links: Maya's link to #127 has no button for Sam.
      await page.goto(`${demoPaths.settings}/sharing`);
      await expect(page.locator(`[data-share-link="${DEMO_SHARE.id}"]`)).toBeVisible();
      await expect(page.locator(`[data-share-link="${DEMO_SHARE.id}"]`).getByRole("button", { name: "Revoke" })).toHaveCount(0);
      await expect(page.getByLabel("Who can create links")).toBeDisabled();

      // With share links off in the workspace, the guide has no Share button.
      await sql()`update workspaces set share_links_enabled = false where slug = 'demo'`;
      await page.goto(demoPaths.pull(DEMO_PRS.main));
      await expect(page.getByText("Guided PR · v2")).toBeVisible();
      await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    });
  });

  test("the shared view works on a phone", async ({ browser }) => {
    const viewer = await signedOutPage(browser, { width: 390 });
    await viewer.goto(`/s/${DEMO_SHARE.token}`);
    await expect(viewer.getByText("Read-only ·")).toBeVisible();
    await expect(viewer.getByText("Guided PR · v1")).toBeVisible();
    const overflow = await viewer.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(viewer, "shared-guide-mobile");
    await viewer.getByRole("navigation", { name: "Guide sections" }).getByRole("button", { name: /Email template/ }).click();
    await expect(viewer.getByText("Section 01 / 02")).toBeVisible();
    await shot(viewer, "shared-guide-mobile-section");
    await viewer.context().close();
  });
});
