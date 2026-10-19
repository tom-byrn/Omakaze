import { createHmac, hkdfSync } from "node:crypto";
import type { Page } from "@playwright/test";
import { guideId, sql } from "./db";
import { DEMO_CONNECTION, DEMO_PRS, DEMO_REPO, DEMO_SHAS, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";

const PROMO = "src/lib/promo.ts";
/** Sam's suggestion on promo.ts (scripts/demo-data/review-threads.ts). */
const SAM_THREAD = "PRRT_mock2002001";

type GraphqlBody = { query: string; variables: Record<string, unknown> };

async function graphqlCalls(op: string) {
  const all = await mockGitHub.requests({ method: "POST", path: "/graphql" });
  return all.filter((r) => new RegExp(`\\b${op}\\b`).test((r.body as GraphqlBody).query));
}

function promoFile(page: Page) {
  return page.locator(`.diff-file[data-path="${PROMO}"]`);
}

function toolbarToggle(page: Page) {
  return page.getByRole("navigation", { name: "Guide sections" }).getByRole("button", { name: /Show resolved/ });
}

/** The secret of repository webhooks, derived from APP_SECRET as in src/lib/crypto.ts. */
function repoWebhookSecret(): string {
  const key = Buffer.from(hkdfSync("sha256", E2E.secret, "guided-prs", "hmac-webhook-secret", 32));
  return createHmac("sha256", key).update("repository-webhooks").digest("base64url");
}

test.describe("Suggested changes and conversations", () => {
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");

  test.beforeEach(() => mockGitHub.clear());
  // Leave the demo as it was: the mock's comments and threads, and what the app recorded.
  test.afterEach(async () => {
    await mockGitHub.reset();
    await sql()`delete from activity where type in ('thread.resolved', 'thread.unresolved')`;
    await sql()`delete from activity where type = 'comment.posted' and data->>'url' like '%discussion_r5%'`;
    await sql()`delete from comments where github_id >= 5000000`;
    await sql()`delete from webhook_deliveries where event = 'pull_request_review_thread'`;
  });

  test("suggests a change and resolves conversations", async ({ page }) => {
    // The whole walk-through in one test (it is also the feature's video).
    test.slow();
    videoName("suggested-changes-and-resolving-conversations");
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
    const promo = promoFile(page);

    // A suggestion made on GitHub: the replaced line, then the suggested one.
    const sam = promo.locator("[data-thread]").filter({ hasText: "Copy nit" });
    const suggestion = sam.locator("[data-suggestion]");
    await expect(suggestion.locator("tr.row-del")).toHaveText(/Your cart is below the minimum for this code/);
    await expect(suggestion.locator("tr.row-add")).toHaveText(/Add a little more to your cart to use this code/);
    await expect(suggestion.locator(".suggestion-change").first()).toBeVisible();
    await sam.scrollIntoViewIfNeeded();
    await caption(page, "A suggestion made on GitHub shows as a small diff of the commented line", "Suggestion");
    await shot(page, "suggestion-from-github");
    await pause(page, 1500);

    // A conversation resolved on GitHub is folded into one line.
    const question = promo.locator("[data-thread]").filter({ hasText: "unique index" });
    await expect(question).toHaveAttribute("data-thread", "resolved");
    await expect(question).toContainText("alexmorgan");
    await expect(question.getByRole("button", { name: "Show" })).toBeVisible();
    await expect(toolbarToggle(page)).toContainText("3");
    await caption(page, "Resolved conversations are collapsed; the toolbar counts them", "Resolved");
    await pause(page, 1500);

    // Comment on two lines and insert a suggestion with their text.
    await caption(page, "Select two lines and insert a suggestion with their text", "New suggestion");
    const first = promo.locator("tr.diff-row").filter({ hasText: 'not_found: "This code' });
    const second = promo.locator("tr.diff-row").filter({ hasText: 'not_started: "This code' });
    await first.hover();
    await first.getByRole("button", { name: "Comment on this line" }).click();
    await second.hover();
    await second.getByRole("button", { name: "Comment on this line" }).click({ modifiers: ["Shift"] });
    await expect(page.getByText("Lines 16–17")).toBeVisible();
    await page.getByRole("button", { name: "Insert suggestion" }).click();
    const textarea = page.getByPlaceholder("Leave a comment");
    await expect(textarea).toHaveValue('```suggestion\n  not_found: "This code doesn\'t exist.",\n  not_started: "This code isn\'t active yet.",\n```\n');
    await expect(page.getByText("Edit the lines inside the suggestion block to suggest a change.")).toBeVisible();
    await pause(page);

    // Edit the first line, then add a note above the block. The preview shows the change.
    await caption(page, "Edit the lines; the preview shows what would change", "New suggestion");
    await textarea.press("ArrowUp");
    await textarea.press("End");
    await textarea.press("Shift+Home");
    await page.keyboard.type('  not_found: "We couldn\'t find this code.",', { delay: E2E.demo ? 25 : 0 });
    await textarea.press("Control+Home");
    await page.keyboard.type("Friendlier, and closer to the other messages:\n\n", { delay: E2E.demo ? 25 : 0 });
    const body =
      'Friendlier, and closer to the other messages:\n\n```suggestion\n  not_found: "We couldn\'t find this code.",\n  not_started: "This code isn\'t active yet.",\n```\n';
    await expect(textarea).toHaveValue(body);
    const preview = page.locator('[aria-label="Suggestion preview"]');
    await expect(preview.locator("tr.row-del").first()).toHaveText(/This code doesn't exist/);
    await expect(preview.locator("tr.row-add").first()).toHaveText(/We couldn't find this code/);
    await preview.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(page, "suggestion-composer-preview");
    await pause(page, 1200);

    // It is posted to GitHub as an ordinary multi-line comment.
    await page.getByRole("button", { name: "Comment on GitHub" }).click();
    await expect(page.getByRole("status")).toContainText("Comment posted to GitHub");
    const [post] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/comments" });
    expect(post.body).toEqual({
      body: body.trim(),
      commit_id: DEMO_SHAS.pr128v2,
      path: PROMO,
      line: 17,
      side: "RIGHT",
      start_line: 16,
      start_side: "RIGHT",
    });
    expect(post.user).toBe("alexmorgan");
    const posted = promo.locator("[data-thread]").filter({ hasText: "Friendlier, and closer" });
    await expect(posted.locator("[data-suggestion] tr.row-del")).toHaveCount(2);
    await expect(posted.locator("[data-suggestion] tr.row-add").first()).toHaveText(/We couldn't find this code/);
    // The new comment's thread is known right away, so it can be resolved.
    await expect(posted.getByRole("button", { name: "Resolve conversation" })).toBeVisible();
    await caption(page, "The suggestion is posted to GitHub as a review comment", "Posted");
    await posted.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(page, "suggestion-posted");
    await pause(page, 1500);

    // Resolve Sam's conversation: GraphQL resolveReviewThread with Alex's own GitHub account.
    await caption(page, "Resolve a conversation; it is resolved on GitHub too", "Resolve");
    await sam.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await pause(page, 600);
    await sam.getByRole("button", { name: "Resolve conversation" }).click();
    await expect(page.getByRole("status")).toContainText("Conversation resolved on GitHub");
    await expect(sam).toHaveAttribute("data-thread", "resolved");
    await expect(sam.getByRole("button", { name: "Show" })).toBeVisible();
    await expect(toolbarToggle(page)).toContainText("4");
    const [resolve] = await graphqlCalls("resolveReviewThread");
    expect((resolve.body as GraphqlBody).variables).toEqual({ threadId: SAM_THREAD });
    expect(resolve.user).toBe("alexmorgan");
    const { extra } = await mockGitHub.state();
    expect((extra.reviewThreads as Record<string, unknown>)["2002001"]).toEqual({ resolvedBy: "alexmorgan" });
    const [logged] = await sql()`select data from activity where type = 'thread.resolved' order by created_at desc limit 1`;
    expect(logged.data).toMatchObject({ path: PROMO, line: 19 });
    await shot(page, "conversation-resolved");
    await pause(page, 1500);

    // Show resolved conversations, then unresolve Sam's again.
    await caption(page, "Show resolved conversations, and unresolve one", "Show resolved");
    await toolbarToggle(page).click();
    await expect(toolbarToggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(sam).toContainText("Resolved by alexmorgan");
    await expect(question).toContainText("Is the unique index on lower(code) part of this pull request?");
    await sam.scrollIntoViewIfNeeded();
    await shot(page, "show-resolved");
    await pause(page, 1200);
    await sam.getByRole("button", { name: "Unresolve conversation" }).click();
    await expect(page.getByRole("status")).toContainText("Conversation unresolved on GitHub");
    await expect(sam).toHaveAttribute("data-thread", "open");
    await expect(toolbarToggle(page)).toContainText("3");
    const [unresolve] = await graphqlCalls("unresolveReviewThread");
    expect((unresolve.body as GraphqlBody).variables).toEqual({ threadId: SAM_THREAD });
    expect(((await mockGitHub.state()).extra.reviewThreads as Record<string, unknown>)["2002001"]).toBeNull();
    await toolbarToggle(page).click();
    await expect(question).toHaveAttribute("data-thread", "resolved");
    await pause(page);

    // The conversation list on "Finish review" hides resolved conversations too.
    await caption(page, "The review step lists comments and hides resolved conversations", "Finish review");
    await page.getByRole("navigation", { name: "Guide sections" }).getByRole("button", { name: /Finish review/ }).click();
    const notice = page.getByText("3 resolved conversations hidden.");
    await expect(notice).toBeVisible();
    await expect(page.getByText("Off by one")).toHaveCount(0);
    await expect(page.locator("li").filter({ hasText: "Copy nit" }).getByText("Suggestion", { exact: true })).toBeVisible();
    await shot(page, "conversation-list");
    await pause(page, 1200);
    await page.getByRole("button", { name: "Show resolved", exact: true }).click();
    await expect(page.getByText("Off by one")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Off by one" })).toContainText("resolved");
    await pause(page, 1500);
    await caption(page);
  });

  test("a pull_request_review_thread webhook refreshes conversations", async ({ page, request }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
    const sam = promoFile(page).locator("[data-thread]").filter({ hasText: "Copy nit" });
    await expect(sam).toHaveAttribute("data-thread", "open");

    // Someone resolves the conversation on GitHub…
    const github = async (path: string, token: string, init: { method?: string; body?: unknown } = {}) => {
      const res = await fetch(`${mockGitHub.url}${path}`, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return res.json();
    };
    await github("/graphql", DEMO_USERS.member.github.token, {
      method: "POST",
      body: { query: "mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id } } }", variables: { threadId: SAM_THREAD } },
    });
    // …and GitHub tells Omakaze.
    const payload = JSON.stringify({
      action: "resolved",
      thread: { node_id: SAM_THREAD, comments: [] },
      pull_request: await github(`/repos/${DEMO_REPO.fullName}/pulls/${DEMO_PRS.main}`, DEMO_CONNECTION.token),
      repository: { id: DEMO_REPO.githubId, full_name: DEMO_REPO.fullName },
      sender: { login: DEMO_USERS.member.github.login },
    });
    const delivery = `e2e-thread-${Date.now()}`;
    const res = await request.post("/api/github/webhook", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "pull_request_review_thread",
        "X-GitHub-Delivery": delivery,
        "X-Hub-Signature-256": `sha256=${createHmac("sha256", repoWebhookSecret()).update(payload).digest("hex")}`,
      },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "processed" });
    const [row] = await sql()`select event, action, status from webhook_deliveries where id = ${delivery}`;
    expect(row).toEqual({ event: "pull_request_review_thread", action: "resolved", status: "processed" });

    // The cached threads were dropped, so the page shows the new state at once.
    await page.reload();
    await expect(sam).toHaveAttribute("data-thread", "resolved");
    await sam.getByRole("button", { name: "Show" }).click();
    await expect(sam).toContainText("Resolved by samokafor");
  });

  test("resolving only accepts threads of the pull request", async ({ request }) => {
    const id = await guideId(DEMO_PRS.main, 2);
    const res = await request.post(`/api/guides/${id}/threads`, { data: { threadId: "PRRT_elsewhere", resolved: true } });
    expect(res.status()).toBe(404);
    expect(await graphqlCalls("resolveReviewThread")).toHaveLength(0);
  });

  test("resolving needs the member's own GitHub account", async ({ request }) => {
    const id = await guideId(DEMO_PRS.main, 2);
    const [acc] = await sql()`
      select a.id, a.access_token_expires_at, a.refresh_token_enc from github_accounts a
      join users u on u.id = a.user_id where lower(u.email) = ${DEMO_USERS.owner.email}`;
    // An expired token that can't be refreshed leaves no usable credential. The connection is never used instead.
    await sql()`update github_accounts set access_token_expires_at = now(), refresh_token_enc = null where id = ${acc.id}`;
    try {
      const res = await request.post(`/api/guides/${id}/threads`, { data: { threadId: SAM_THREAD, resolved: true } });
      expect(res.status()).toBe(403);
      expect(await res.json()).toEqual({ error: "Link your GitHub account to resolve conversations." });
      expect(await graphqlCalls("resolveReviewThread")).toHaveLength(0);
    } finally {
      await sql()`update github_accounts set access_token_expires_at = ${acc.access_token_expires_at}, refresh_token_enc = ${acc.refresh_token_enc} where id = ${acc.id}`;
    }
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("shows suggestions and resolved conversations", async ({ page }) => {
      await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
      const promo = promoFile(page);
      const sam = promo.locator("[data-thread]").filter({ hasText: "Copy nit" });
      await expect(sam.locator("[data-suggestion] tr.row-add")).toBeVisible();
      // The code pane is short on a phone: scroll it (not the page) so the element starts below the sticky file header.
      const reveal = (el: Element) => {
        const pane = el.closest(".overflow-y-auto");
        if (pane) pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 56;
      };
      const diff = sam.locator("[data-suggestion]");
      await diff.evaluate(reveal);
      await shot(page, "mobile-suggestion", { locator: diff });
      const question = promo.locator("[data-thread]").filter({ hasText: "unique index" });
      await expect(question).toHaveAttribute("data-thread", "resolved");
      await question.evaluate(reveal);
      await shot(page, "mobile-resolved-conversation", { locator: question });
      const resolvedBox = await question.boundingBox();
      expect(resolvedBox && resolvedBox.x + resolvedBox.width).toBeLessThanOrEqual(390);
      const box = await sam.boundingBox();
      expect(box && box.x + box.width).toBeLessThanOrEqual(390);
    });
  });
});
