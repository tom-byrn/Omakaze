import { createHash, createHmac, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { githubAvatar } from "../scripts/demo-data";
import { DEMO_OWNER_PR, demoPeopleColumns } from "../scripts/demo-data/review-requests";
import { clearReviewMarks, guideId, sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";
import { ghUser } from "./mock-github";

const demoRepoIds = () => sql()`(select r.id from repositories r join workspaces w on w.id = r.workspace_id where w.slug = 'demo')`;

/** Put the demo's review requests and assignees back on the cached pull requests. */
async function restorePeople(...numbers: number[]): Promise<void> {
  for (const n of numbers) {
    const c = demoPeopleColumns(n, githubAvatar);
    await sql()`
      update pull_requests
      set requested_reviewers = ${sql().json(c.requestedReviewers)}, requested_teams = ${sql().json(c.requestedTeams)},
          assignees = ${sql().json(c.assignees)}
      where number = ${n} and repository_id in ${demoRepoIds()}`;
  }
}

async function cachedLogins(n: number): Promise<{ reviewers: string[]; assignees: string[] }> {
  const [row] = await sql()`select requested_reviewers, assignees from pull_requests where number = ${n} and repository_id in ${demoRepoIds()}`;
  const logins = (list: { login: string }[]) => list.map((p) => p.login);
  return { reviewers: logins(row.requested_reviewers), assignees: logins(row.assignees) };
}

/** The repository webhook secret the app derives from APP_SECRET (repoWebhookSecret in src/lib/crypto.ts). */
function webhookSecret(): string {
  const key = Buffer.from(hkdfSync("sha256", E2E.secret, "guided-prs", "hmac-webhook-secret", 32));
  return createHmac("sha256", key).update("repository-webhooks").digest("base64url");
}

async function sendWebhook(event: string, payload: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify(payload);
  const delivery = `e2e-${randomUUID()}`;
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
  return delivery;
}

/** Call the mock GitHub API as Maya (as if she changed the pull request on GitHub). */
async function onGitHub(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${mockGitHub.url}/repos/${DEMO_REPO.fullName}${path}`, {
    method,
    headers: { Authorization: `Bearer ${DEMO_USERS.admin.github.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
  return res.json();
}

const filterTabs = (page: Page) => page.getByRole("navigation", { name: "Filter by involvement" });
const row = (page: Page, n: number) => page.getByRole("listitem").filter({ hasText: `#${n}` });

test.describe("Needs my review", () => {
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock (linked GitHub accounts)");

  test.describe("as the owner", () => {
    test.afterEach(() => clearReviewMarks("owner", DEMO_PRS.main, 2));

    test("filters the dashboard by review requests, authorship and assignees", async ({ page }) => {
      // A long walkthrough through the dashboard, a guide and the repository page.
      test.slow();
      videoName("needs-my-review-walkthrough");
      await page.goto(demoPaths.dashboard);
      const tabs = filterTabs(page);
      await expect(tabs.getByRole("link", { name: /Needs my review\s*3/ })).toBeVisible();
      await expect(tabs.getByRole("link", { name: /Mine\s*1/ })).toBeVisible();
      await expect(tabs.getByRole("link", { name: /Assigned\s*2/ })).toBeVisible();
      await expect(tabs.getByRole("link", { name: /All\s*5/ })).toHaveAttribute("aria-current", "page");
      await caption(page, "The pull request list has four filters: Needs my review, Mine, Assigned and All, each with a count.");
      await pause(page, 2500);

      // Needs my review: requested on #128 and #131, and #129's guide has sections Alex hasn't reviewed.
      await tabs.getByRole("link", { name: /Needs my review/ }).click();
      await expect(page).toHaveURL(/filter=needs-review/);
      await expect(page.getByRole("listitem")).toHaveCount(3);
      await expect(row(page, DEMO_PRS.main)).toContainText("Review requested");
      await expect(row(page, DEMO_PRS.main)).toContainText("0/6 sections reviewed by you");
      await expect(row(page, DEMO_PRS.noGuide)).toContainText("Review requested");
      await expect(row(page, DEMO_PRS.noGuide)).toContainText("Frontend");
      await expect(row(page, DEMO_PRS.outdated)).not.toContainText("Review requested");
      await expect(row(page, DEMO_PRS.outdated)).toContainText("0/2 sections reviewed by you");
      await expect(row(page, DEMO_OWNER_PR)).toHaveCount(0);
      await expect(row(page, DEMO_PRS.main).getByTitle("alexmorgan", { exact: true })).toBeVisible();
      await caption(page, "Needs my review: pull requests where your review is requested, and published guides with sections you haven't reviewed.");
      await shot(page, "needs-my-review-dashboard");
      await pause(page, 3000);

      // Progress follows the review marks on the guide.
      await caption(page, "Review two sections of #128's guide…");
      await row(page, DEMO_PRS.main).getByRole("link", { name: "Open guide" }).click();
      await expect(page).toHaveURL(/\/pull\/128/);
      await expect(page.getByText("0/6 reviewed")).toBeVisible();
      await pause(page, 1500);
      await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 1 }));
      await page.getByRole("button", { name: "Mark reviewed and continue" }).click();
      await expect(page.getByText("1/6 reviewed")).toBeVisible();
      await page.getByRole("button", { name: "Mark reviewed and continue" }).click();
      await expect(page.getByText("2/6 reviewed")).toBeVisible();
      // The counter updates before the request finishes; wait for both marks to be saved.
      const v2 = await guideId(DEMO_PRS.main, 2);
      await expect
        .poll(async () => (await sql()`select count(*)::int as n from section_reviews r join users u on u.id = r.user_id where r.guide_id = ${v2} and lower(u.email) = ${DEMO_USERS.owner.email}`)[0].n)
        .toBe(2);
      await pause(page, 1200);

      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await caption(page, "…and the dashboard shows your progress on each pull request.");
      await expect(row(page, DEMO_PRS.main)).toContainText("2/6 sections reviewed by you");
      await shot(page, "needs-my-review-progress", { locator: row(page, DEMO_PRS.main) });
      await pause(page, 2500);

      // The filter combines with the search and the state tabs.
      await page.getByPlaceholder("Search title, author, branch or #number").fill("promo");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/filter=needs-review/);
      await expect(page).toHaveURL(/q=promo/);
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(row(page, DEMO_PRS.main)).toBeVisible();
      await caption(page, "Filters combine with the search and the state tabs.");
      await pause(page, 1500);
      await page.getByRole("navigation", { name: "Filter by state" }).getByRole("link", { name: /Merged/ }).click();
      await expect(page).toHaveURL(/state=merged/);
      await expect(page.getByText("Only open pull requests need review.")).toBeVisible();
      await pause(page, 1500);

      // Mine: the pull request Alex opened, with the reviewers he asked.
      await page.goto(demoPaths.dashboard);
      await filterTabs(page).getByRole("link", { name: /Mine/ }).click();
      await expect(page).toHaveURL(/filter=mine/);
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(row(page, DEMO_OWNER_PR)).toContainText("Show an error when checkout can't reach the store");
      await expect(row(page, DEMO_OWNER_PR).getByTitle("mayachen", { exact: true })).toBeVisible();
      await expect(row(page, DEMO_OWNER_PR).getByTitle("samokafor", { exact: true })).toBeVisible();
      await caption(page, "Mine: pull requests you opened, with the reviewers you requested.");
      await shot(page, "needs-my-review-mine");
      await pause(page, 2500);

      // Assigned.
      await filterTabs(page).getByRole("link", { name: /Assigned/ }).click();
      await expect(page).toHaveURL(/filter=assigned/);
      await expect(page.getByRole("listitem")).toHaveCount(2);
      await expect(row(page, DEMO_PRS.outdated)).toContainText("Assigned to you");
      await expect(row(page, DEMO_OWNER_PR)).toContainText("Assigned to you");
      await caption(page, "Assigned: pull requests assigned to you on GitHub.");
      await shot(page, "needs-my-review-assigned");
      await pause(page, 2500);

      // The repository page has the same filters.
      await page.goto(`${demoPaths.repo}?filter=needs-review`);
      await expect(filterTabs(page).getByRole("link", { name: /Needs my review\s*3/ })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("listitem")).toHaveCount(3);
      await page.mouse.move(1200, 140);
      await caption(page, "The repository page has the same filters.");
      await shot(page, "needs-my-review-repository");
      await pause(page, 2000);
      await caption(page);
    });

    test("fits a phone screen", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await expect(row(page, DEMO_PRS.main)).toContainText("Review requested");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await shot(page, "needs-my-review-mobile", { fullPage: true });
    });
  });

  test.describe("GitHub changes", () => {
    const deliveries: string[] = [];
    test.afterEach(async () => {
      await mockGitHub.reset();
      await restorePeople(DEMO_PRS.draft, DEMO_PRS.main);
      if (deliveries.length > 0) await sql()`delete from webhook_deliveries where id in ${sql()(deliveries.splice(0))}`;
      await sql()`delete from activity where type = 'review.submitted' and data->>'url' like '%pullrequestreview-5%'`;
      await sql()`delete from comments where github_id >= 5000000`;
    });

    test("picks up review requests from a sync", async ({ page }) => {
      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await expect(row(page, DEMO_PRS.draft)).toHaveCount(0);

      // Maya asks for Alex's review on GitHub.
      await onGitHub("POST", `/pulls/${DEMO_PRS.draft}/requested_reviewers`, { reviewers: ["alexmorgan"] });
      await page.getByRole("button", { name: "Sync" }).click();
      await expect(row(page, DEMO_PRS.draft)).toContainText("Review requested");
      await expect(filterTabs(page).getByRole("link", { name: /Needs my review\s*4/ })).toBeVisible();
      expect((await cachedLogins(DEMO_PRS.draft)).reviewers).toEqual(["alexmorgan"]);
    });

    test("follows review request and assignment webhooks", async ({ page }) => {
      // Each change is made on (mock) GitHub and then delivered as a webhook, so a background sync agrees.
      // The payloads carry the pull request as it was before the change; the event's person still counts.
      const before = await onGitHub("GET", `/pulls/${DEMO_PRS.draft}`);
      const repository = { id: DEMO_REPO.githubId, full_name: DEMO_REPO.fullName };
      const send = async (action: string, extra: Record<string, unknown>) =>
        deliveries.push(await sendWebhook("pull_request", { action, number: DEMO_PRS.draft, pull_request: before, repository, ...extra }));

      await onGitHub("POST", `/pulls/${DEMO_PRS.draft}/requested_reviewers`, { reviewers: ["alexmorgan"] });
      await send("review_requested", { requested_reviewer: ghUser("alexmorgan") });
      expect(await cachedLogins(DEMO_PRS.draft)).toEqual({ reviewers: ["alexmorgan"], assignees: ["priya-s"] });
      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await expect(row(page, DEMO_PRS.draft)).toContainText("Review requested");

      await onGitHub("DELETE", `/pulls/${DEMO_PRS.draft}/requested_reviewers`, { reviewers: ["alexmorgan"] });
      await send("review_request_removed", { requested_reviewer: ghUser("alexmorgan"), pull_request: await onGitHub("GET", `/pulls/${DEMO_PRS.draft}`) });
      expect((await cachedLogins(DEMO_PRS.draft)).reviewers).toEqual([]);
      await page.reload();
      await expect(row(page, DEMO_PRS.draft)).toHaveCount(0);

      await onGitHub("POST", `/issues/${DEMO_PRS.draft}/assignees`, { assignees: ["alexmorgan"] });
      await send("assigned", { assignee: ghUser("alexmorgan") });
      expect((await cachedLogins(DEMO_PRS.draft)).assignees).toEqual(["priya-s", "alexmorgan"]);
      await page.goto(`${demoPaths.dashboard}?filter=assigned`);
      await expect(row(page, DEMO_PRS.draft)).toContainText("Assigned to you");

      await onGitHub("DELETE", `/issues/${DEMO_PRS.draft}/assignees`, { assignees: ["alexmorgan"] });
      await send("unassigned", { assignee: ghUser("alexmorgan"), pull_request: await onGitHub("GET", `/pulls/${DEMO_PRS.draft}`) });
      expect((await cachedLogins(DEMO_PRS.draft)).assignees).toEqual(["priya-s"]);
      await page.reload();
      await expect(row(page, DEMO_PRS.draft)).toHaveCount(0);
    });

    test("drops the request when the review is submitted from Omakaze", async ({ page }) => {
      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await expect(row(page, DEMO_PRS.main)).toContainText("Review requested");
      const res = await page.request.post(`/api/guides/${await guideId(DEMO_PRS.main, 2)}/review`, { data: { event: "COMMENT", body: "" } });
      expect(res.status()).toBe(200);
      const [post] = await mockGitHub.requests({ method: "POST", path: `/repos/${DEMO_REPO.fullName}/pulls/${DEMO_PRS.main}/reviews` });
      expect(post.user).toBe("alexmorgan");
      expect((await cachedLogins(DEMO_PRS.main)).reviewers).toEqual([]);

      // Still listed: the guide has sections Alex hasn't marked.
      await page.reload();
      await expect(row(page, DEMO_PRS.main)).not.toContainText("Review requested");
      await expect(row(page, DEMO_PRS.main)).toContainText("0/6 sections reviewed by you");
    });
  });

  test.describe("without a linked GitHub account", () => {
    test.use({ user: "member" });
    let saved: Record<string, unknown>[] = [];
    test.beforeEach(async () => {
      saved = await sql()`delete from github_accounts where github_id = ${DEMO_USERS.member.github.id} returning *`;
    });
    test.afterEach(async () => {
      for (const r of saved) await sql()`insert into github_accounts ${sql()(r)}`;
    });

    test("lists unreviewed guides and explains why requests can't be matched", async ({ page }) => {
      videoName("needs-my-review-without-github");
      await page.goto(`${demoPaths.dashboard}?filter=needs-review`);
      await expect(page.getByText("Review requests on GitHub can't be matched to you")).toBeVisible();
      await expect(page.getByRole("link", { name: "Link your GitHub account" })).toHaveAttribute("href", "/account");
      // Sam is requested on #131 and #126, but only guides with unreviewed sections can be matched.
      // One of Sam's v1 marks carries over to the unchanged section in v2.
      await expect(row(page, DEMO_PRS.main)).toContainText("1/6 sections reviewed by you");
      await expect(row(page, DEMO_PRS.noGuide)).toHaveCount(0);
      await expect(row(page, DEMO_OWNER_PR)).toHaveCount(0);
      await caption(page, "Members without a linked GitHub account still see guides they haven't finished reviewing.");
      await shot(page, "needs-my-review-without-github");
      await pause(page, 2500);

      await filterTabs(page).getByRole("link", { name: /Mine/ }).click();
      await expect(page.getByText("Link your GitHub account.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Link GitHub account" })).toBeVisible();
      await shot(page, "needs-my-review-mine-without-github");
      await pause(page, 1500);
      await caption(page);
    });
  });

  test.describe("REST API", () => {
    let tokenId: string | null = null;
    test.afterEach(async () => {
      if (tokenId) await sql()`delete from api_tokens where id = ${tokenId}`;
      tokenId = null;
    });

    test("filters GET /api/v1/pulls for the token's user", async ({ request }) => {
      const token = `omk_${randomBytes(24).toString("base64url")}`;
      tokenId = `e2e${randomBytes(6).toString("hex")}`;
      await sql()`
        insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
        select ${tokenId}, u.id, w.id, 'e2e', 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}
        from users u, workspaces w where lower(u.email) = ${DEMO_USERS.owner.email} and w.slug = 'demo'`;
      const get = async (query: string) => {
        const res = await request.get(`/api/v1/pulls?${query}`, { headers: { Authorization: `Bearer ${token}` } });
        return { status: res.status(), body: await res.json() };
      };

      const review = await get("filter=needs-review");
      expect(review.status).toBe(200);
      expect(review.body.pulls.map((p: { number: number }) => p.number)).toEqual([DEMO_PRS.noGuide, DEMO_PRS.main, DEMO_PRS.outdated]);
      expect(review.body.pulls[1]).toMatchObject({
        requested_reviewers: ["alexmorgan"],
        requested_teams: [],
        assignees: ["mayachen"],
        review_progress: { version: 2, sections: 6, reviewed: 0 },
      });
      expect(review.body.pulls[0]).toMatchObject({ requested_teams: ["Frontend"], review_progress: null });

      expect((await get("filter=mine")).body.pulls.map((p: { number: number }) => p.number)).toEqual([DEMO_OWNER_PR]);
      expect((await get("filter=assigned&repo=acme/storefront")).body.pulls.map((p: { number: number }) => p.number)).toEqual([DEMO_PRS.outdated, DEMO_OWNER_PR]);
      expect((await get("filter=needs-review&state=merged")).body.pulls).toEqual([]);
      // Every cached pull request, including the merged ones of the insights history.
      const [cached] = await sql()`select count(*)::int as n from pull_requests p join repositories r on r.id = p.repository_id where r.full_name = ${DEMO_REPO.fullName}`;
      expect((await get("state=all")).body.pulls).toHaveLength(cached.n);
      const bad = await get("filter=reviewed");
      expect(bad.status).toBe(400);
      expect(bad.body.error).toContain("needs-review");
    });
  });
});
