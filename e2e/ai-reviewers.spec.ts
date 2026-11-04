import { createHmac, hkdfSync, randomUUID } from "node:crypto";
import { DEMO_AI_BOTS } from "../scripts/demo-data";
import { sql } from "./db";
import { DEMO_CONNECTION, DEMO_PRS, DEMO_REPO, demoPaths, E2E, expect, mockGitHub, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";
import { MOCK_AI_MODEL, mockAiRequests, startMockAi, type MockAiServer } from "./mock-ai";

/**
 * AI code reviewers (src/lib/ai-reviewers): an automatic guide waits for Claude Code Review and
 * Greptile, then is written with their findings, which the viewer shows on the overview, in the
 * section that covers each one and on their comments. The reviewers are bots posting through the
 * mock GitHub API; the guide comes from a mock AI provider (e2e/mock-ai.ts).
 */

const PR = DEMO_PRS.noGuide; // #131, "Serve product images through the CDN resizer"
const repository = { id: DEMO_REPO.githubId, full_name: DEMO_REPO.fullName };

function webhookSecret(): string {
  const key = Buffer.from(hkdfSync("sha256", E2E.secret, "guided-prs", "hmac-webhook-secret", 32));
  return createHmac("sha256", key).update("repository-webhooks").digest("base64url");
}

async function sendWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const res = await fetch(`${E2E.appUrl}/api/github/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": `e2e-${randomUUID()}`,
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", webhookSecret()).update(body).digest("hex")}`,
    },
    body,
  });
  expect(res.status, await res.text()).toBe(200);
}

/** Call the mock GitHub API with a token (a bot's, or the workspace connection's). */
async function github(token: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${mockGitHub.url}/repos/${DEMO_REPO.fullName}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok, `${method} ${path}: ${res.status}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

async function workspaceRow() {
  const [ws] = await sql()`select id from workspaces where slug = 'demo'`;
  return ws.id as string;
}

async function clearPull(): Promise<void> {
  await sql()`delete from jobs where type = 'generate_guide' and payload->>'prNumber' = ${String(PR)}`;
  await sql()`delete from guides where pr_number = ${PR} and workspace_id = ${await workspaceRow()}`;
}

async function guideRow() {
  const [g] = await sql()`select id, status, ai_reviews from guides where pr_number = ${PR} and workspace_id = ${await workspaceRow()} order by version desc limit 1`;
  return g as { id: string; status: string; ai_reviews: { phase: string; outcome: string | null } | null } | undefined;
}

test.describe("AI code reviewers", () => {
  test.skip(E2E.github !== "mock", "needs the mock GitHub API");
  test.use({ user: "owner" });

  let ai: MockAiServer;

  test.beforeAll(async () => {
    ai = await startMockAi({ delayMs: E2E.demo ? 2500 : 300 });
    await mockGitHub.reset();
    await clearPull();
    await sql()`
      update workspaces set auto_generate = true, regenerate_on_push = false, skip_drafts = true,
        ai_provider = 'ollama', ai_model = ${MOCK_AI_MODEL}, ai_base_url = ${`${ai.url}/v1`}, ai_api_key_enc = null,
        wait_for_ai_reviewers = true, ai_reviewer_wait_minutes = 15, ai_reviewers = null
      where slug = 'demo'`;
  });

  test.afterAll(async () => {
    await clearPull();
    await sql()`
      update workspaces set auto_generate = false, ai_provider = null, ai_model = null, ai_base_url = null,
        wait_for_ai_reviewers = true, ai_reviewer_wait_minutes = 15, ai_reviewers = null
      where slug = 'demo'`;
    await ai?.close();
  });

  test("an automatic guide waits for Claude Code Review and Greptile and discusses their findings", async ({ page }) => {
    test.setTimeout(E2E.demo ? 420_000 : 180_000);
    videoName("ai-code-reviewers");

    /* Settings: which reviewers to wait for --------------------------------------------- */
    await page.goto(`${demoPaths.settings}/automation`);
    await expect(page.getByLabel("Create a guide for every new pull request")).toBeChecked();
    await caption(page, "Automatic guides are on: a guide is written for every new pull request", "Settings");
    await pause(page, 1800);
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "AI code reviewers", exact: true }) });
    await expect(panel).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await caption(page, "New: automatic guides wait for AI code reviewers like Claude Code Review and Greptile", "Settings");
    await expect(panel.getByLabel("Wait for AI code reviewers before writing automatic guides")).toBeChecked();
    await pause(page, 2200);
    await caption(page, "This repository uses Claude Code Review and Greptile, so the others are turned off", "Settings");
    await panel.getByLabel("CodeRabbit").uncheck();
    await panel.getByLabel("GitHub Copilot").uncheck();
    await pause(page, 800);
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved.");
    await shot(page, "ai-reviewers-settings", { locator: panel });
    const [ws] = await sql()`select ai_reviewers from workspaces where slug = 'demo'`;
    const enabled = (ws.ai_reviewers as { key: string; enabled: boolean }[]).filter((r) => r.enabled).map((r) => r.key);
    expect(enabled).toEqual(["claude", "greptile"]);
    await pause(page, 1200);

    /* The pull request opens: a guide starts and waits ---------------------------------- */
    const pull = await github(DEMO_CONNECTION.token, "GET", `/pulls/${PR}`);
    const headSha = (pull.head as { sha: string }).sha;
    await sendWebhook("pull_request", { action: "opened", pull_request: pull, repository });
    await expect.poll(async () => (await guideRow())?.ai_reviews?.phase ?? null, { timeout: 30_000 }).toBe("waiting");

    await page.goto(demoPaths.pull(PR));
    const wait = page.getByTestId("ai-review-wait");
    await expect(page.getByText("Waiting for AI code reviewers", { exact: true })).toBeVisible();
    await caption(page, "Devon opens #131. Omakaze starts the guide, then waits for the AI reviewers", "Pull request #131");
    await pause(page, 2500);

    // The Claude Code Review workflow starts, and Greptile reports a pending status.
    const run = await github(DEMO_AI_BOTS.claude.token, "POST", "/check-runs", { name: DEMO_AI_BOTS.claude.check, head_sha: headSha, status: "in_progress" });
    await sendWebhook("check_run", { action: "created", check_run: { head_sha: headSha, name: DEMO_AI_BOTS.claude.check }, repository });
    await github(DEMO_AI_BOTS.greptile.token, "POST", `/statuses/${headSha}`, { state: "pending", context: DEMO_AI_BOTS.greptile.check, description: "Reviewing" });
    await sendWebhook("status", { sha: headSha, context: DEMO_AI_BOTS.greptile.check, state: "pending", repository });
    await expect(wait.getByRole("listitem").filter({ hasText: "Claude Code Review" })).toContainText("reviewing", { timeout: 30_000 });
    await expect(wait.getByRole("listitem").filter({ hasText: "Greptile" })).toContainText("reviewing");
    await caption(page, "Claude Code Review runs as a GitHub Actions check; Greptile reports a commit status", "Waiting");
    await shot(page, "ai-reviewers-waiting");
    await pause(page, 3000);

    // Greptile finishes: a summary comment, a review with one inline finding, and its status.
    await github(DEMO_AI_BOTS.greptile.token, "POST", `/issues/${PR}/comments`, {
      body: "<!-- greptile_comment -->\n## Greptile Summary\n\nRoutes `next/image` through the CDN resizer with a custom loader. Small, focused change.\n\n**Confidence score: 4/5**",
    });
    const greptileReview = await github(DEMO_AI_BOTS.greptile.token, "POST", `/pulls/${PR}/reviews`, {
      event: "COMMENT",
      commit_id: headSha,
      body: "2 files reviewed, 1 comment",
      comments: [
        {
          path: "src/lib/images.ts",
          line: 9,
          side: "RIGHT",
          body: "**style:** The path is concatenated without encoding. A file name with a space or `#` would produce an invalid resizer URL; consider `encodeURI(path)`.",
        },
      ],
    });
    await github(DEMO_AI_BOTS.greptile.token, "POST", `/statuses/${headSha}`, { state: "success", context: DEMO_AI_BOTS.greptile.check, description: "Review complete" });
    await sendWebhook("pull_request_review", {
      action: "submitted",
      review: { id: greptileReview.id, user: { login: DEMO_AI_BOTS.greptile.login }, body: greptileReview.body, state: "commented", html_url: greptileReview.html_url },
      pull_request: pull,
      repository,
    });
    await expect(wait.getByRole("listitem").filter({ hasText: "Greptile" })).toContainText("done · 1 finding", { timeout: 30_000 });
    await caption(page, "Greptile is done with one finding. Claude is still reviewing, so the guide keeps waiting", "Waiting");
    await pause(page, 3000);

    // Claude Code Review finishes: a review with an inline finding, then the check completes.
    const claudeReview = await github(DEMO_AI_BOTS.claude.token, "POST", `/pulls/${PR}/reviews`, {
      event: "COMMENT",
      commit_id: headSha,
      body: "## Code review\n\nThe loader and config change look right. One bug: images from other hosts produce broken URLs (inline comment).",
      comments: [
        {
          path: "src/lib/images.ts",
          line: 8,
          side: "RIGHT",
          body: "**Bug:** `src.replace` only strips `https://images.acme-storefront.com`. Local images such as `/placeholder.png`, or any other host, are appended unchanged, so this returns `https://cdn.acme-storefront.com/resize/w=640,q=75https://…`.\n\nReturn `src` as it is when it doesn't start with the image host.",
        },
      ],
    });
    await github(DEMO_AI_BOTS.claude.token, "PATCH", `/check-runs/${run.id}`, { status: "completed", conclusion: "success" });
    await sendWebhook("check_run", { action: "completed", check_run: { head_sha: headSha, name: DEMO_AI_BOTS.claude.check }, repository });
    void claudeReview;

    /* The reviews are in: the guide is written with them ------------------------------- */
    await expect.poll(async () => (await guideRow())?.status, { timeout: 60_000 }).toBe("ready");
    const g = await guideRow();
    expect(g?.ai_reviews).toMatchObject({ phase: "complete", outcome: "all_done" });
    const prompts = await mockAiRequests(ai.url);
    const guidePrompt = prompts.find((r) => r.schema === "guided_pr");
    expect(guidePrompt?.system).toContain("AI code reviewers (bots such as Claude Code Review");
    expect(guidePrompt?.user).toContain("Findings from AI code reviewers on this pull request:");
    expect(guidePrompt?.user).toContain("- src/lib/images.ts line 8: **Bug:** `src.replace` only strips");
    expect(guidePrompt?.user).toContain("### Greptile\nSummary:\n2 files reviewed, 1 comment");

    const card = page.getByTestId("ai-reviews-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await caption(page, "Both reviews are in. The guide is written with their findings", "Guide");
    await expect(card).toContainText("2 findings");
    await expect(card).toContainText("Claude Code Review · src/lib/images.ts:8 · section 01");
    await expect(card).toContainText("Greptile · src/lib/images.ts:9 · section 01");
    await expect(card).toContainText("Written after the AI reviews came in.");
    await pause(page, 1500);
    await card.scrollIntoViewIfNeeded();
    await caption(page, "The overview lists every AI finding and the section that covers it", "Guide");
    await shot(page, "ai-reviewers-overview");
    await pause(page, 3000);

    /* A finding opens its section and line --------------------------------------------- */
    await card.getByRole("button", { name: /src\.replace only strips/ }).click();
    const findings = page.getByTestId("section-ai-findings");
    await expect(findings).toContainText("2 AI review findings in this section");
    await expect(page.getByRole("heading", { level: 2, name: "A loader that builds CDN resizer URLs" })).toBeVisible();
    await caption(page, "Section 01 adds a one-line verdict per finding; the full comment stays next to the code", "Section 01");
    await pause(page, 2000);
    const warning = page.locator(".md-alert-warning").filter({ hasText: "Claude Code Review" });
    await expect(warning).toContainText("holds, local images go through the loader too.");
    await warning.scrollIntoViewIfNeeded();
    await pause(page, 3000);
    const tag = page.getByTitle("AI code reviewer: Claude Code Review").first();
    await expect(tag).toBeVisible();
    await tag.scrollIntoViewIfNeeded();
    await caption(page, "In the diff, AI reviewers' comments are labeled. Reply or resolve them as usual", "Section 01");
    await shot(page, "ai-reviewers-section");
    await pause(page, 3500);
    await caption(page);
  });
});
