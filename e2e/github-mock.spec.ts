import { sql } from "./db";
import { DEMO_PRS, DEMO_SHAS, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("GitHub (mock API)", () => {
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");

  test.beforeEach(() => mockGitHub.clear());
  // Leave the demo as it was: the mock's comments, and the records the app keeps of posted comments.
  test.afterEach(async () => {
    await mockGitHub.reset();
    await sql()`delete from activity where type = 'comment.posted' and data->>'url' like '%discussion_r5%'`;
    await sql()`delete from comments where github_id >= 5000000`;
  });

  test("shows review comments and posts a reply", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 3 }));
    // Review comments come from GitHub (the app caches them for 10 seconds).
    const thread = page
      .locator("div")
      .filter({ hasText: "already caps the discount" })
      .filter({ has: page.getByRole("button", { name: "Reply…" }) })
      .last();
    await expect(thread).toContainText("samokafor");
    await thread.scrollIntoViewIfNeeded();
    await shot(page, "guide-review-comments");
    await pause(page);

    await thread.getByRole("button", { name: "Reply…" }).click();
    await page.getByPlaceholder("Reply").fill("Agreed, keeping the guard.");
    await page.getByRole("button", { name: "Reply on GitHub" }).click();
    await expect(page.getByRole("status")).toContainText("Reply posted to GitHub");
    await expect(page.getByText("Agreed, keeping the guard.")).toBeVisible();

    const [reply] = await mockGitHub.requests({ method: "POST", path: /\/pulls\/128\/comments\/\d+\/replies$/ });
    expect(reply.body).toEqual({ body: "Agreed, keeping the guard." });
    expect(reply.user).toBe("alexmorgan");
    const { reviewComments } = await mockGitHub.state();
    expect(reviewComments.some((c) => c.body === "Agreed, keeping the guard." && c.in_reply_to_id === 2_001_005)).toBe(true);
    await pause(page);
  });

  test("posts a line comment", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
    const row = page.locator('.diff-file[data-path="src/lib/promo.ts"] tr.diff-row').filter({ hasText: "export function checkPromo" });
    await row.hover();
    await row.getByRole("button", { name: "Comment on this line" }).click();
    await page.getByPlaceholder("Leave a comment").fill("Could `now` default to the request time instead?");
    await shot(page, "guide-line-comment");
    await page.getByRole("button", { name: "Comment on GitHub" }).click();
    await expect(page.getByRole("status")).toContainText("Comment posted to GitHub");

    const [post] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/comments" });
    expect(post.body).toMatchObject({
      path: "src/lib/promo.ts",
      side: "RIGHT",
      commit_id: DEMO_SHAS.pr128v2,
      body: "Could `now` default to the request time instead?",
    });
    await pause(page);
  });
});
