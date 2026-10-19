import type { Page } from "@playwright/test";
import { clearReviewMarks, guideId, sql } from "./db";
import { DEMO_PRS, DEMO_SHAS, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";
import { storageStatePath } from "./setup";

const REPO = "/repos/acme/storefront";
const automation = `${demoPaths.settings}/automation`;
const prUrl = (n: number) => `${E2E.appUrl}${demoPaths.pull(n)}`;
const STATUSES_128 = `${REPO}/statuses/${DEMO_SHAS.pr128v2}`;
/** Updates wait 5 seconds for more marks; a busy machine adds to that. */
const WORKER_TIMEOUT = 60_000;

type StatusBody = { state: string; description: string; context: string; target_url: string };
type CheckRunBody = { name: string; head_sha?: string; status: string; conclusion?: string; details_url: string; output: { title: string; summary: string } };

async function statusPosts(path = STATUSES_128) {
  return (await mockGitHub.requests({ method: "POST", path })).map((r) => r.body as StatusBody);
}

/** Wait until the worker has posted a commit status with this description. */
async function waitForStatus(description: string, path = STATUSES_128): Promise<StatusBody> {
  await expect.poll(async () => (await statusPosts(path)).map((b) => b.description), { timeout: WORKER_TIMEOUT }).toContain(description);
  return (await statusPosts(path)).find((b) => b.description === description)!;
}

async function waitForCheckRun(method: "POST" | "PATCH", title: string): Promise<{ path: string; user: string | null; body: CheckRunBody }> {
  const path = method === "POST" ? `${REPO}/check-runs` : /\/repos\/acme\/storefront\/check-runs\/\d+$/;
  const find = async () =>
    (await mockGitHub.requests({ method, path }))
      .map((r) => ({ path: r.path, user: r.user, body: r.body as CheckRunBody }))
      .find((r) => r.body.output?.title === title);
  await expect.poll(async () => Boolean(await find()), { timeout: WORKER_TIMEOUT }).toBe(true);
  return (await find())!;
}

function guideCheckPanel(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Guide check on GitHub" }) });
}

async function chooseMode(page: Page, label: "Off" | "Informational" | "Require review", reviewers = 1) {
  const panel = guideCheckPanel(page);
  await panel.getByRole("radio", { name: label }).check();
  await panel.getByLabel("Reviewers per section").fill(String(reviewers));
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("status")).toContainText("Saved", { timeout: 30_000 });
}

/** Mark the open section (of six) as reviewed and wait for the viewer to move on, which it does once the mark is saved. */
async function markAndContinue(page: Page, section: number) {
  await expect(page.getByText(`Section 0${section} / 06`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Mark reviewed and continue" }).click();
  const next = section < 6 ? page.getByText(`Section 0${section + 1} / 06`) : page.getByText("You reviewed 6 of 6 sections.");
  await expect(next).toBeVisible({ timeout: 30_000 });
}

/** Turn the check off and remove what the specs created, once the worker is idle. */
async function resetGuideCheck() {
  await sql()`update workspaces set guide_check = 'off', guide_check_reviewers = 1 where slug = 'demo'`;
  await sql()`update repositories set guide_check = null where workspace_id = (select id from workspaces where slug = 'demo')`;
  await sql()`delete from jobs where type = 'update_guide_check' and status = 'queued'`;
  await expect
    .poll(async () => (await sql()`select count(*)::int as n from jobs where type = 'update_guide_check' and status = 'running'`)[0].n, { timeout: WORKER_TIMEOUT })
    .toBe(0);
  await sql()`delete from guide_checks where repository_id in (select id from repositories where workspace_id = (select id from workspaces where slug = 'demo'))`;
  await sql()`delete from activity where type = 'settings.updated' and data->>'section' = 'guide-check'`;
}

test.describe("Guide check", () => {
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");
  // Each test waits for several debounced updates from the worker.
  test.slow();

  test.beforeEach(async () => {
    await resetGuideCheck();
    await clearReviewMarks("owner", DEMO_PRS.main, 2);
    await clearReviewMarks("admin", DEMO_PRS.main, 2);
    await mockGitHub.reset();
  });
  test.afterEach(async ({ browser }) => {
    await resetGuideCheck();
    await clearReviewMarks("owner", DEMO_PRS.main, 2);
    await clearReviewMarks("admin", DEMO_PRS.main, 2);
    await mockGitHub.reset();
    // Undo the GitHub App of the check run test: the connection, and the stored app (removed through
    // /admin, which also clears the page's cache of it).
    const [app] = await sql()`select 1 from instance_settings where key = 'github_app'`;
    await sql()`update github_connections set type = 'token', installation_id = null where workspace_id = (select id from workspaces where slug = 'demo')`;
    if (!app) return;
    const context = await browser.newContext({ storageState: storageStatePath("owner"), baseURL: E2E.appUrl });
    const admin = await context.newPage();
    admin.on("dialog", (d) => void d.accept());
    await expect(async () => {
      await admin.goto("/admin");
      await admin.getByRole("button", { name: "Remove stored app" }).click({ timeout: 2000 });
      await expect(admin.getByRole("button", { name: "Create GitHub App on my account" })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60_000 });
    await sql()`delete from instance_settings where key = 'github_app'`;
    await context.close();
  });

  test("reports review progress as a commit status", async ({ page }) => {
    videoName("guide-check-walkthrough");
    // Maya already reviewed the first two sections of version 2.
    const id = await guideId(DEMO_PRS.main, 2);
    await sql()`
      insert into section_reviews (section_id, guide_id, user_id)
      select s.id, s.guide_id, u.id from guide_sections s, users u
      where s.guide_id = ${id} and s.position <= 2 and lower(u.email) = ${DEMO_USERS.admin.email}`;
    await page.goto(automation);
    await caption(page, "Settings → Automation: report review progress on GitHub, and require it before merging");
    const panel = guideCheckPanel(page);
    await panel.scrollIntoViewIfNeeded();
    await pause(page, 1500);
    await chooseMode(page, "Require review");
    await pause(page);

    // Saving updates every open pull request. The demo repository uses a token connection: commit statuses.
    const first = await waitForStatus("2 of 6 sections reviewed");
    expect(first).toEqual({ state: "pending", context: "omakaze/guide", description: "2 of 6 sections reviewed", target_url: prUrl(DEMO_PRS.main) });
    const [post] = await mockGitHub.requests({ method: "POST", path: STATUSES_128 });
    expect(post.user).toBe("storefront-bot");
    expect(await waitForStatus("Guide is outdated", `${REPO}/statuses/${DEMO_SHAS.pr129v2}`)).toMatchObject({ state: "pending" });
    // #130 (a draft) and #131 have no guide; merged and closed pull requests are left alone.
    const descriptions = async () =>
      (await mockGitHub.requests({ method: "POST", path: /\/statuses\// })).map((r) => (r.body as StatusBody).description).sort();
    await expect
      .poll(descriptions, { timeout: WORKER_TIMEOUT })
      .toEqual(["2 of 6 sections reviewed", "Guide is outdated", "No guide yet", "No guide yet"]);

    await caption(page, "Each open pull request gets a status: progress, an outdated guide, or no guide yet");
    await page.reload();
    await expect(page.getByTestId("recent-guide-check")).toHaveCount(4);
    await page.getByRole("heading", { name: "Recent guide checks" }).scrollIntoViewIfNeeded();
    await pause(page, 1500);
    await shot(page, "guide-check-recent-statuses");

    // The pull request page shows the check as last posted.
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 1 }));
    const status = page.getByTestId("guide-check-status");
    const header = page.locator("h1").first().locator("xpath=../..");
    await expect(status).toContainText("Action required");
    await expect(status).toContainText("2 of 6 sections reviewed");
    await caption(page, "The pull request header shows the check. Marking sections reviewed updates it");
    await pause(page, 1500);
    await shot(page, "guide-check-header-action-required", { locator: header });

    await mockGitHub.clear();
    for (const n of [1, 2, 3]) await markAndContinue(page, n);
    await expect(page.getByText("3/6 reviewed")).toBeVisible();
    await waitForStatus("3 of 6 sections reviewed");
    await expect(status).toContainText("3 of 6 sections reviewed", { timeout: 30_000 });
    await caption(page, "Marks made in quick succession are sent as one update, a few seconds later");
    await pause(page, 1500);

    for (const n of [4, 5, 6]) await markAndContinue(page, n);
    const done = await waitForStatus("All 6 sections reviewed");
    expect(done).toMatchObject({ state: "success", context: "omakaze/guide", target_url: prUrl(DEMO_PRS.main) });
    await expect(status).toContainText("Passing", { timeout: 30_000 });
    await expect(status).toContainText("All 6 sections reviewed");
    await caption(page, "Every section reviewed: the status passes, so a required check stops blocking the merge");
    await pause(page, 1500);
    await shot(page, "guide-check-header-passing", { locator: header });

    // The settings page shows the summary that was posted.
    await page.goto(automation);
    const latest = page.getByTestId("recent-guide-check").first();
    await expect(latest).toContainText("acme/storefront#128");
    await expect(latest).toContainText("Passing");
    await expect(latest.locator("table tr").nth(1)).toContainText("Maya Chen, Alex Morgan");
    await expect(latest.locator("table tr").nth(3)).toContainText("Alex Morgan");
    await latest.scrollIntoViewIfNeeded();
    await caption(page, "Settings lists each update with the summary GitHub shows");
    await pause(page, 2000);
    await shot(page, "guide-check-summary", { locator: latest });
    const [row] = await sql()`select conclusion, method, title, error from guide_checks where pr_number = ${DEMO_PRS.main}`;
    expect(row).toEqual({ conclusion: "success", method: "status", title: "All 6 sections reviewed", error: null });

    // A repository can override the workspace setting.
    await mockGitHub.clear();
    await page.goto(demoPaths.repos);
    const repoRow = page.getByRole("listitem").filter({ hasText: "acme/storefront" });
    await caption(page, "Repositories can override it, for example to make the check informational");
    await repoRow.getByLabel("Guide check").selectOption("informational");
    await expect
      .poll(async () => (await sql()`select guide_check from repositories where full_name = 'acme/storefront'`)[0].guide_check)
      .toBe("informational");
    await pause(page, 1200);
    await shot(page, "guide-check-repository-override", { locator: repoRow });
    await expect
      .poll(async () => (await sql()`select conclusion from guide_checks where pr_number = ${DEMO_PRS.main}`)[0].conclusion, { timeout: WORKER_TIMEOUT })
      .toBe("neutral");
    const informational = (await statusPosts()).at(-1)!;
    expect(informational).toMatchObject({ state: "success", description: "All 6 sections reviewed" });
    await caption(page);
  });

  test("coalesces a burst of review marks into one update", async ({ page }) => {
    await sql()`update workspaces set guide_check = 'informational' where slug = 'demo'`;
    const id = await guideId(DEMO_PRS.main, 2);
    const sections = await sql()`select id from guide_sections where guide_id = ${id} order by position limit 3`;
    const [{ now }] = await sql()`select now() as now`;
    const responses = await Promise.all(
      sections.map((s) => page.request.post(`/api/guides/${id}/progress`, { data: { sectionId: s.id, reviewed: true } })),
    );
    expect(responses.map((r) => r.status())).toEqual([200, 200, 200]);

    const sent = await waitForStatus("3 of 6 sections reviewed");
    expect(sent).toMatchObject({ state: "success", context: "omakaze/guide" });
    const [{ n }] = await sql()`select count(*)::int as n from jobs where type = 'update_guide_check' and created_at >= ${now} and payload->>'prNumber' = '128'`;
    expect(n).toBe(1);
    // Nothing else follows once the queue is idle.
    await expect
      .poll(async () => (await sql()`select count(*)::int as n from jobs where type = 'update_guide_check' and status in ('queued', 'running')`)[0].n, { timeout: WORKER_TIMEOUT })
      .toBe(0);
    expect(await statusPosts()).toHaveLength(1);
  });

  test("uses a check run for GitHub App connections", async ({ page }) => {
    // Create a GitHub App through the manifest flow on /admin, answered by the mock.
    await page.goto("/admin");
    const action = await page.locator('form[action*="/settings/apps/new"]').first().getAttribute("action");
    const state = new URL(action!).searchParams.get("state")!;
    await page.goto(`/api/github/manifest?code=e2e&state=${encodeURIComponent(state)}`);
    await expect(page.getByText("GitHub App omakaze-e2e created and saved.")).toBeVisible();
    // The page keeps the app configuration for 30 seconds. Then: an older app without the new permissions.
    await mockGitHub.stub({ method: "GET", path: "/app", json: { slug: "omakaze-e2e", permissions: { contents: "read", pull_requests: "write" } } });
    await expect(async () => {
      await page.goto("/admin");
      await expect(page.getByText("omakaze-e2e · id 424242")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByText("The app can't post the guide check on pull requests.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add Checks and Commit statuses (read and write)" })).toBeVisible();
    await shot(page, "guide-check-admin-missing-permissions", { locator: page.locator("section").filter({ hasText: "GitHub App" }).first() });
    await mockGitHub.reset();

    // The workspace's connection becomes an installation of that app.
    await sql()`update github_connections set type = 'app', installation_id = 4242 where workspace_id = (select id from workspaces where slug = 'demo')`;
    await page.goto(automation);
    await chooseMode(page, "Require review", 1);
    const created = await waitForCheckRun("POST", "0 of 6 sections reviewed");
    expect(created.body).toMatchObject({
      name: "Omakaze guide",
      head_sha: DEMO_SHAS.pr128v2,
      status: "completed",
      conclusion: "action_required",
      details_url: prUrl(DEMO_PRS.main),
    });
    expect(created.body.output.summary).toContain(`| 01 | [Promo codes table](${prUrl(DEMO_PRS.main)}?section=1) | Not reviewed | – |`);
    // Sent with the installation's token (the mock's installation tokens act as the demo connection).
    expect(created.user).toBe("storefront-bot");
    expect(await mockGitHub.requests({ method: "POST", path: /\/statuses\// })).toHaveLength(0);

    // A review mark updates the same check run.
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 1 }));
    await markAndContinue(page, 1);
    const updated = await waitForCheckRun("PATCH", "1 of 6 sections reviewed");
    const { checkRuns } = await mockGitHub.state();
    const run = checkRuns.find((r) => r.head_sha === DEMO_SHAS.pr128v2)!;
    expect(updated.path).toBe(`${REPO}/check-runs/${run.id}`);
    expect(run).toMatchObject({ conclusion: "action_required", output: { title: "1 of 6 sections reviewed" } });
    await expect(page.getByTestId("guide-check-status")).toContainText("1 of 6 sections reviewed", { timeout: 30_000 });

    // GitHub refuses the update (an installation that hasn't accepted the Checks permission): the error is shown.
    await mockGitHub.stub({ method: "PATCH", path: "re:/check-runs/\\d+$", status: 403, json: { message: "Resource not accessible by integration" } });
    await markAndContinue(page, 2);
    await page.goto(automation);
    const latest = page.getByTestId("recent-guide-check").first();
    await expect(async () => {
      await page.reload();
      await expect(latest).toContainText("Update failed", { timeout: 2000 });
    }).toPass({ timeout: WORKER_TIMEOUT });
    await expect(latest).toContainText("Resource not accessible by integration (GitHub 403)");
    await expect(latest).toContainText("needs the Checks permission");
    await expect(latest).toContainText("check run");
    await latest.scrollIntoViewIfNeeded();
    await shot(page, "guide-check-error", { locator: latest });

    // Narrow screens.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(guideCheckPanel(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Tall enough that the panel needs no scrolling, so the sticky header doesn't cover it.
    await page.setViewportSize({ width: 390, height: 3200 });
    await shot(page, "guide-check-settings-mobile", { locator: guideCheckPanel(page) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await expect(page.getByTestId("guide-check-status")).toBeVisible();
    await shot(page, "guide-check-header-mobile");
  });
});
