import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Locator, Page } from "@playwright/test";
import { guideId, sql } from "./db";
import { DEMO_PRS, DEMO_SHAS, DEMO_USERS, demoPaths, E2E, expect, mockGitHub, test, type DemoUserKey } from "./fixtures";
import { DEMO_OVERLAY } from "./demo-overlay";
import { caption, pause, shot, videoName } from "./media";

/**
 * Two-way review over MCP: an agent reads the review conversations of #128, answers one, improves
 * the guide, resolves the thread and posts comments and a review, all as the token's user.
 */

const PR = `acme/storefront#${DEMO_PRS.main}`;
const PROMO = "src/lib/promo.ts";
const REVIEW_TOOLS = ["reply_to_review_comment", "post_review_comment", "resolve_review_thread", "submit_review", "post_pr_comment"];
/** The sentence of section 2 ("Validating a code") that Sam's question shows to be unclear. */
const CHECK_BEFORE = "**Check:** the end date is exclusive (`endsAt <= now` is expired); the start date is inclusive.";
const CHECK_AFTER =
  "**Check:** the end date is exclusive and the start date inclusive. A code whose `ends_at` is Monday 00:00 works all of Sunday and is `expired` from midnight on (`endsAt <= now`).";

type ToolText = { text: string; isError: boolean };

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${E2E.appUrl}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolText> {
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content ?? []) as { type: string; text?: string }[];
  return { text: content.map((c) => c.text ?? "").join("\n"), isError: Boolean(res.isError) };
}

/** An API token for a demo user, created the way Settings does (only the hash is stored). */
async function apiToken(user: DemoUserKey, name: string): Promise<string> {
  const token = `omk_${randomBytes(24).toString("base64url")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    select ${`e2e${randomBytes(8).toString("hex")}`}, u.id, w.id, ${name}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}
    from users u, workspaces w where lower(u.email) = ${DEMO_USERS[user].email} and w.slug = 'demo'`;
  return token;
}

/** A review comment written on GitHub, as a demo user, straight to the mock. */
async function onGitHub(user: DemoUserKey, path: string, body: unknown): Promise<{ id: number }> {
  const res = await fetch(`${mockGitHub.url}/repos/acme/storefront${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEMO_USERS[user].github.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number };
}

async function graphqlCalls(op: string) {
  const all = await mockGitHub.requests({ method: "POST", path: "/graphql" });
  return all.filter((r) => new RegExp(`\\b${op}\\b`).test((r.body as { query: string }).query));
}

/** Section 2 of #128 v2, whose body the agent changes. */
async function validationSection(): Promise<{ id: string; body: string }> {
  const [row] = await sql()`select id, body from guide_sections where guide_id = ${await guideId(DEMO_PRS.main, 2)} and position = 2`;
  return row as { id: string; body: string };
}

/** Scroll the pane that holds an element (the guide's text or code pane, not the page) so it starts `offset` px below the pane's top. */
async function reveal(locator: Locator, offset: number): Promise<void> {
  await locator.evaluate(
    (el, [off, smooth]) => {
      window.scrollTo(0, 0);
      const pane = el.parentElement?.closest(".overflow-y-auto");
      if (!pane) return;
      const top = pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - off;
      pane.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
    },
    [offset, E2E.demo] as const,
  );
  await pause(locator.page(), 700);
}

/**
 * A transcript of the MCP session for the video and a screenshot: a plain page the test fills in,
 * labelled as the test client's view (it is not a page of the app).
 */
function transcript(page: Page) {
  return {
    async open(title: string, subtitle: string) {
      await page.goto("about:blank");
      await page.evaluate(
        ([t, s]) => {
          document.title = t;
          // Added before the demo overlay's cursor and caption, which stay in the body.
          document.body.insertAdjacentHTML(
            "afterbegin",
            `
            <style>
              body { margin: 0; background: #f6f4ef; color: #141518; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
              main { max-width: 1080px; margin: 0 auto; padding: 32px 32px 140px; }
              h1 { font: 400 30px/1.2 Georgia, serif; margin: 0 0 4px; }
              .sub { color: #5c5d61; font: 12px/18px ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase; }
              .entry { margin-top: 18px; border: 1px solid rgba(0,0,0,.15); background: #fff; }
              .head { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-bottom: 1px dashed rgba(0,0,0,.2); font: 13px/18px ui-monospace, monospace; }
              .kind { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #5c5d61; border: 1px dashed rgba(0,0,0,.25); padding: 0 6px; }
              .name { font-weight: 600; }
              .args { color: #5c5d61; white-space: pre-wrap; word-break: break-word; }
              pre { margin: 0; padding: 12px 14px; font: 12px/18px ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; }
              .error pre { color: #b42318; background: rgba(180,35,24,.04); }
              .error .kind { color: #b42318; border-color: rgba(180,35,24,.4); }
            </style>
            <main><h1></h1><p class="sub"></p><div id="log"></div></main>`,
          );
          document.querySelector("h1")!.textContent = t;
          document.querySelector(".sub")!.textContent = s;
        },
        [title, subtitle] as const,
      );
      if (E2E.demo) await page.evaluate(DEMO_OVERLAY);
    },
    async add(kind: string, name: string, args: unknown, result: ToolText) {
      await page.evaluate(
        ([k, n, a, r]) => {
          const entry = document.createElement("section");
          entry.className = `entry${r.isError ? " error" : ""}`;
          entry.dataset.tool = n;
          const head = document.createElement("div");
          head.className = "head";
          for (const [cls, value] of [["kind", r.isError ? `${k} · error` : k], ["name", n], ["args", a]]) {
            const span = document.createElement("span");
            span.className = cls;
            span.textContent = value;
            head.appendChild(span);
          }
          const pre = document.createElement("pre");
          pre.textContent = r.text;
          entry.append(head, pre);
          document.getElementById("log")!.appendChild(entry);
          entry.scrollIntoView({ block: "end", behavior: "smooth" });
        },
        [kind, name, JSON.stringify(args), result] as const,
      );
    },
  };
}

test.describe("Two-way review over MCP", () => {
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");

  let section: { id: string; body: string };
  let reviewers: unknown;

  test.beforeEach(async () => {
    await mockGitHub.clear();
    section = await validationSection();
    [{ requested_reviewers: reviewers }] = await sql()`select requested_reviewers from pull_requests where number = ${DEMO_PRS.main}`;
  });

  // Leave the demo as it was: the mock's comments and threads, and what the app recorded.
  test.afterEach(async () => {
    await mockGitHub.reset();
    await sql()`update guide_sections set body = ${section.body} where id = ${section.id}`;
    await sql()`update pull_requests set requested_reviewers = ${sql().json(reviewers as never)} where number = ${DEMO_PRS.main}`;
    await sql()`update workspaces set allow_agent_approvals = false where slug = 'demo'`;
    await sql()`delete from comments where github_id >= 5000000`;
    await sql()`delete from activity where data ? 'agent' or (type = 'settings.updated' and data->>'section' = 'agent review')`;
    await sql()`delete from activity where type = 'token.created' and data->>'name' = 'Claude Code'`;
    await sql()`delete from api_tokens where name in ('Claude Code', 'e2e review agent')`;
  });

  test.describe("as the pull request's author", () => {
    test.use({ user: "admin" });

    test("an agent answers a review comment, improves the guide and resolves the thread", async ({ page }) => {
      test.slow();
      videoName("agent-addresses-review-comments-over-mcp");

      // Sam asks a question on GitHub, on a line that section 2 explains.
      const question = await onGitHub("member", `/pulls/${DEMO_PRS.main}/comments`, {
        body: "Is `ends_at` inclusive? A code that ends on Sunday should still work on Sunday.",
        commit_id: DEMO_SHAS.pr128v2,
        path: PROMO,
        line: 37,
        side: "RIGHT",
      });
      const threadId = `PRRT_mock${question.id}`;

      // Maya creates a token for her agent. The new panel says what agents may do on GitHub.
      await page.goto(`${demoPaths.settings}/tokens`);
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Reviews by agents" }) });
      await expect(panel).toContainText("submit_review APPROVE");
      await expect(panel).toContainText("Your agents post as mayachen on GitHub.");
      await expect(panel.getByLabel(/Allow agents to approve pull requests/)).not.toBeChecked();
      await panel.scrollIntoViewIfNeeded();
      await caption(page, "Agents can reply, comment, resolve and review over MCP, as the member whose token they use", "Settings");
      await shot(page, "settings-reviews-by-agents", { locator: panel });
      await pause(page, 2500);
      await page.getByRole("heading", { name: "API tokens", exact: true }).scrollIntoViewIfNeeded();
      await caption(page, "Maya creates an API token for her agent", "API token");
      await page.getByLabel("Name").fill("Claude Code");
      await page.getByRole("button", { name: "Create token" }).click();
      const tokenText = page.locator("code").filter({ hasText: /^omk_/ });
      await expect(tokenText).toBeVisible();
      const token = (await tokenText.textContent())!.trim();
      await pause(page, 1500);

      // The agent's session, as its MCP client sees it.
      const log = transcript(page);
      await log.open("Agent session over MCP", "Test client · API token “Claude Code” of Maya Chen · /api/mcp");
      const client = await connect(token);
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toEqual(expect.arrayContaining([...REVIEW_TOOLS, "list_review_comments", "update_section"]));
      const readOnly = new Map((await client.listTools()).tools.map((t) => [t.name, t.annotations?.readOnlyHint ?? false]));
      expect(REVIEW_TOOLS.filter((t) => readOnly.get(t))).toEqual([]);
      expect(readOnly.get("list_review_comments")).toBe(true);
      const prompt = await client.getPrompt({ name: "address_review_comments", arguments: { pr_url: "https://github.com/acme/storefront/pull/128" } });
      const promptText = (prompt.messages[0].content as { text: string }).text;
      expect(promptText).toContain("Address the review comments on https://github.com/acme/storefront/pull/128 using the Omakaze MCP.");
      expect(promptText).toContain("resolve_review_thread only when your reply or the guide change fully answers it");
      await caption(page, "The address_review_comments prompt walks the agent through the review", "MCP prompt");
      await log.add("prompt", "address_review_comments", { pr_url: "https://github.com/acme/storefront/pull/128" }, { text: promptText, isError: false });
      await pause(page, 2500);

      // 1. Read the open conversations.
      const listed = await call(client, "list_review_comments", { pr: PR, state: "open" });
      expect(listed.isError).toBe(false);
      expect(listed.text).toContain(`${PR}: 7 conversations, 4 open and 3 resolved. Showing the open ones.`);
      expect(listed.text).toContain("Comments marked (you) are yours: posted through Omakaze, or by your GitHub account mayachen.");
      expect(listed.text).toContain(
        [`## ${PROMO}:37 · open`, `thread_id: ${threadId}`, `Guide section 2 "Validating a code" (section_id ${section.id})`, `- comment_id ${question.id} · samokafor · `].join("\n"),
      );
      expect(listed.text).toContain("  Is `ends_at` inclusive? A code that ends on Sunday should still work on Sunday.");
      expect(listed.text).toMatch(/- comment_id 2001006 · mayachen \(you\)/);
      expect(listed.text).not.toContain("PRRT_mock2002002");
      await caption(page, "list_review_comments: open threads with IDs, the guide section and who wrote what", "Read");
      await log.add("tool", "list_review_comments", { pr: PR, state: "open" }, listed);
      await pause(page, 3500);

      // 2. Answer the question in its thread.
      const replyBody =
        "No, `ends_at` is exclusive: `checkPromo` treats a code as expired once `endsAt <= now` (line 37). For a code that should work all of Sunday, set `ends_at` to Monday 00:00. I made this clearer in section 2 of the guide.";
      const reply = await call(client, "reply_to_review_comment", { pr: PR, thread_id: threadId, body: replyBody });
      expect(reply.isError).toBe(false);
      expect(reply.text).toMatch(new RegExp(`^Replied on src/lib/promo\\.ts:37 as mayachen\\.\\ncomment_id: \\d+\\nthread_id: ${threadId}\\n`));
      const [posted] = await mockGitHub.requests({ method: "POST", path: `/repos/acme/storefront/pulls/128/comments/${question.id}/replies` });
      expect(posted.body).toEqual({ body: replyBody });
      expect(posted.user).toBe("mayachen");
      await caption(page, "reply_to_review_comment: the answer goes to GitHub as Maya", "Reply");
      await log.add("tool", "reply_to_review_comment", { pr: PR, thread_id: threadId, body: "No, `ends_at` is exclusive: …" }, reply);
      await pause(page, 2500);

      // 3. Fix the guide where the explanation was unclear.
      expect(section.body).toContain(CHECK_BEFORE);
      const guide = await call(client, "get_guide", { pr: PR });
      expect(guide.text).toContain(`## 2. Validating a code\nsection_id: ${section.id}`);
      const updated = await call(client, "update_section", { section_id: section.id, body: section.body.replace(CHECK_BEFORE, CHECK_AFTER) });
      expect(updated).toEqual({ text: "Updated section 2: Validating a code.", isError: false });
      expect((await validationSection()).body).toContain(CHECK_AFTER);
      await caption(page, "update_section: the guide now says when a code expires", "Guide");
      await log.add("tool", "update_section", { section_id: section.id, body: "… **Check:** the end date is exclusive and the start date inclusive. …" }, updated);
      await pause(page, 2000);

      // 4. Resolve the thread it answered, with Maya's own GitHub account.
      const resolved = await call(client, "resolve_review_thread", { pr: PR, thread_id: threadId });
      expect(resolved).toEqual({ text: `Resolved the conversation on ${PROMO}:37 (thread_id ${threadId}).`, isError: false });
      const [resolve] = await graphqlCalls("resolveReviewThread");
      expect((resolve.body as { variables: unknown }).variables).toEqual({ threadId });
      expect(resolve.user).toBe("mayachen");
      await caption(page, "resolve_review_thread: resolved on GitHub with Maya's linked account", "Resolve");
      await log.add("tool", "resolve_review_thread", { pr: PR, thread_id: threadId }, resolved);
      await pause(page, 2000);

      // 5. A multi-line comment with a suggested change, numbered as get_diff shows the lines.
      const suggestion = [
        "  // starts_at is inclusive and ends_at exclusive: a code ending Monday 00:00 works all of Sunday.",
        '  if (promo.startsAt && promo.startsAt > now) return { ok: false, reason: "not_started" };',
        '  if (promo.endsAt && promo.endsAt <= now) return { ok: false, reason: "expired" };',
      ].join("\n");
      const commentArgs = { pr: PR, path: PROMO, start_line: 36, line: 37, body: "Say it in the code too:", suggestion, head_sha: DEMO_SHAS.pr128v2 };
      const commented = await call(client, "post_review_comment", commentArgs);
      expect(commented.isError).toBe(false);
      expect(commented.text).toMatch(/^Commented on src\/lib\/promo\.ts:36-37 with a suggested change as mayachen\.\ncomment_id: \d+\nthread_id: PRRT_mock\d+\n/);
      // The first POST is Sam's question.
      const line = (await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/comments" })).at(-1)!;
      expect(line.body).toEqual({
        body: `Say it in the code too:\n\n\`\`\`suggestion\n${suggestion}\n\`\`\``,
        commit_id: DEMO_SHAS.pr128v2,
        path: PROMO,
        line: 37,
        side: "RIGHT",
        start_line: 36,
        start_side: "RIGHT",
      });
      expect(line.user).toBe("mayachen");
      await caption(page, "post_review_comment: lines 36–37 with a suggested change", "Comment");
      await log.add("tool", "post_review_comment", { ...commentArgs, suggestion: "  // starts_at is inclusive … (3 lines)" }, commented);
      await pause(page, 2500);

      // 6. A review with a summary, and a note in the conversation.
      const review = await call(client, "submit_review", { pr: PR, event: "COMMENT", body: "Answered Sam's question about `ends_at` and clarified section 2." });
      expect(review.isError).toBe(false);
      expect(review.text).toContain(`Submitted a review (COMMENTED) on ${PR} at ${DEMO_SHAS.pr128v2.slice(0, 7)} as mayachen.`);
      const [submitted] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/reviews" });
      expect(submitted.body).toEqual({ commit_id: DEMO_SHAS.pr128v2, event: "COMMENT", body: "Answered Sam's question about `ends_at` and clarified section 2." });
      const note = await call(client, "post_pr_comment", { pr: PR, body: "The guide now explains when a promo code expires (section 2)." });
      expect(note.text).toMatch(new RegExp(`^Commented on ${PR} as mayachen\\.\\ncomment_id: \\d+\\nURL: `));
      const [issue] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/issues/128/comments" });
      expect(issue.body).toEqual({ body: "The guide now explains when a promo code expires (section 2)." });
      await caption(page, "submit_review and post_pr_comment post as Maya too", "Review");
      await log.add("tool", "submit_review", { pr: PR, event: "COMMENT", body: "Answered Sam's question …" }, review);
      await log.add("tool", "post_pr_comment", { pr: PR, body: "The guide now explains …" }, note);
      await pause(page, 2500);

      // 7. Approving is off unless an admin turns it on.
      const approve = await call(client, "submit_review", { pr: PR, event: "APPROVE" });
      expect(approve.isError).toBe(true);
      expect(approve.text).toBe(
        `Agents can't approve pull requests in the "Acme" workspace. Ask the user to approve it themselves; a workspace admin can allow approvals by agents at ${E2E.appUrl}/w/demo/settings/tokens.`,
      );
      expect(await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/reviews" })).toHaveLength(1);
      await caption(page, "APPROVE is refused: agents can't approve unless an admin allows it", "Approve");
      await log.add("tool", "submit_review", { pr: PR, event: "APPROVE" }, approve);
      await pause(page, 2500);
      await shot(page, "mcp-tool-results", { fullPage: true });
      await client.close();

      // Omakaze recorded the posts as Maya's own, with the agent named in the activity log.
      const rows = await sql()`
        select c.kind, c.posted_as, u.email from comments c join users u on u.id = c.author_user_id
        where c.github_id >= 5000000 order by c.created_at`;
      expect(rows.map((r) => [r.kind, r.posted_as, r.email])).toEqual([
        ["reply", "user", DEMO_USERS.admin.email],
        ["review", "user", DEMO_USERS.admin.email],
        ["review_submit", "user", DEMO_USERS.admin.email],
        ["issue", "user", DEMO_USERS.admin.email],
      ]);
      const activity = await sql()`select type from activity where data->>'agent' = 'Claude Code' order by created_at`;
      expect(activity.map((a) => a.type)).toEqual(["comment.posted", "thread.resolved", "comment.posted", "review.submitted", "comment.posted"]);

      // In the guide: the clearer explanation, the reply in the resolved thread and the suggestion.
      await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
      await expect(page.getByText("A code whose ends_at is Monday 00:00 works all of Sunday")).toBeVisible();
      const promo = page.locator(`.diff-file[data-path="${PROMO}"]`);
      const thread = promo.locator("[data-thread]").filter({ hasText: "Is ends_at inclusive?" });
      await expect(thread).toHaveAttribute("data-thread", "resolved");
      await reveal(page.getByText("A code whose ends_at is Monday 00:00 works all of Sunday"), 320);
      await reveal(thread, 120);
      await caption(page, "The section explains the end date now, and the thread the agent answered is resolved", "Guide");
      await shot(page, "viewer-updated-section");
      await pause(page, 3000);
      await thread.getByRole("button", { name: "Show" }).click();
      await expect(thread).toContainText("Resolved by mayachen");
      await expect(thread).toContainText("No, ends_at is exclusive");
      const ours = promo.locator("[data-thread]").filter({ hasText: "Say it in the code too" });
      await expect(ours.locator("[data-suggestion] tr.row-add").first()).toContainText("starts_at is inclusive and ends_at exclusive");
      // Posted as Maya, so they are hers to delete.
      await expect(ours.getByRole("button", { name: "Delete" })).toBeVisible();
      await expect(thread.getByRole("button", { name: "Delete" })).toHaveCount(1);
      // Below the sticky file header, so the "Resolved by" bar shows.
      await reveal(thread, 52);
      await caption(page, "Maya's reply and suggestion show as her own comments, which she can delete", "Guide");
      await shot(page, "viewer-agent-reply-and-suggestion");
      await pause(page, 3000);

      // The activity log names the agent.
      await page.goto(demoPaths.activity);
      await expect(page.getByText(`replied on ${PROMO} in ${PR} via Claude Code`)).toBeVisible();
      await expect(page.getByText(`resolved a conversation on ${PROMO}:37 in ${PR} via Claude Code`)).toBeVisible();
      await expect(page.getByText(`commented on ${PR} via Claude Code`)).toBeVisible();
      await caption(page, "The activity log shows what the agent did, and for whom", "Activity");
      await shot(page, "activity-agent-review");
      await pause(page, 2500);
      await caption(page);
    });

    test("lists the user's pull requests with filter", async () => {
      const client = await connect(await apiToken("admin", "e2e review agent"));
      const mine = await call(client, "list_pull_requests", { filter: "mine" });
      expect(mine.text).toContain(`acme/storefront#${DEMO_PRS.main} [open]`);
      expect(mine.text).not.toContain(`#${DEMO_PRS.noGuide} `);
      const review = await call(client, "list_pull_requests", { filter: "needs-review" });
      expect(review.text).toContain(`acme/storefront#${DEMO_PRS.outdated} [open]`);
      expect(review.text).not.toContain(`#${DEMO_PRS.main} `);
      const who = await call(client, "whoami", {});
      expect(who.text).toContain("GitHub: mayachen. Review tools post as this account.");
      expect(who.text).toContain("Approvals by agents: not allowed in this workspace.");
      await client.close();
    });

    test("refuses lines outside the diff and threads of other pull requests", async () => {
      const client = await connect(await apiToken("admin", "e2e review agent"));
      const outside = await call(client, "post_review_comment", { pr: PR, path: PROMO, line: 99, body: "?" });
      expect(outside).toEqual({
        text: "Line 99 of src/lib/promo.ts is not in the diff. GitHub accepts comments only on lines of a hunk: #1 new 1-54, old none.",
        isError: true,
      });
      const old = await call(client, "post_review_comment", { pr: PR, path: PROMO, line: 37, side: "old", body: "?" });
      expect(old.isError).toBe(true);
      expect(old.text).toContain("Line 37 (old) of src/lib/promo.ts is not in the diff.");
      // Old line 21 of cart.ts is the removed `formatMoney`; suggestions only replace new lines.
      const left = await call(client, "post_review_comment", { pr: PR, path: "src/lib/cart.ts", line: 21, side: "old", suggestion: "x" });
      expect(left).toEqual({ text: 'A suggested change replaces lines of the new version. Comment on side "new" lines to suggest one.', isError: true });
      const stale = await call(client, "post_review_comment", { pr: PR, path: PROMO, line: 37, body: "?", head_sha: DEMO_SHAS.pr128v1 });
      expect(stale.text).toMatch(/^The pull request has new commits \(head is now [0-9a-f]{7}\)\. Re-read it and try again\.$/);
      // Sam's suggestion on #128 is not a thread of #129.
      const elsewhere = await call(client, "reply_to_review_comment", { pr: `acme/storefront#${DEMO_PRS.outdated}`, thread_id: "PRRT_mock2002001", body: "Hi" });
      expect(elsewhere).toEqual({ text: `Thread PRRT_mock2002001 is not part of acme/storefront#${DEMO_PRS.outdated}. Use a thread_id from list_review_comments.`, isError: true });
      const resolveElsewhere = await call(client, "resolve_review_thread", { pr: `acme/storefront#${DEMO_PRS.outdated}`, comment_id: 2002001 });
      expect(resolveElsewhere.text).toContain("is not part of a conversation on acme/storefront#129");
      const missing = await call(client, "reply_to_review_comment", { pr: PR, body: "Hi" });
      expect(missing).toEqual({ text: "Pass thread_id or comment_id from list_review_comments.", isError: true });
      expect(await mockGitHub.requests({ method: "POST", path: /^\/repos\/acme\/storefront\/pulls\/\d+\/comments/ })).toHaveLength(0);
      expect(await graphqlCalls("resolveReviewThread")).toHaveLength(0);
      await client.close();
    });
  });

  test("an admin can allow agents to approve", async ({ page }) => {
    // Alex is requested as a reviewer on #128.
    const client = await connect(await apiToken("owner", "e2e review agent"));
    expect((await call(client, "submit_review", { pr: PR, event: "APPROVE" })).isError).toBe(true);

    await page.goto(`${demoPaths.settings}/tokens`);
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Reviews by agents" }) });
    await panel.getByLabel(/Allow agents to approve pull requests/).check();
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByRole("status")).toHaveText("Saved.");
    const [ws] = await sql()`select allow_agent_approvals from workspaces where slug = 'demo'`;
    expect(ws.allow_agent_approvals).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await shot(page, "settings-agent-approvals-allowed", { locator: panel });

    const approved = await call(client, "submit_review", { pr: PR, event: "APPROVE", body: "Checked the redemption limit and the 422 path." });
    expect(approved.text).toContain(`Submitted a review (APPROVED) on ${PR} at ${DEMO_SHAS.pr128v2.slice(0, 7)} as alexmorgan.`);
    const [review] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/reviews" });
    expect(review.body).toEqual({ commit_id: DEMO_SHAS.pr128v2, event: "APPROVE", body: "Checked the redemption limit and the 422 path." });
    expect(review.user).toBe("alexmorgan");
    // GitHub settles the review request; the cached pull request agrees.
    const [pull] = await sql()`select requested_reviewers from pull_requests where number = ${DEMO_PRS.main}`;
    expect((pull.requested_reviewers as { login: string }[]).map((r) => r.login)).not.toContain("alexmorgan");
    expect((await call(client, "whoami", {})).text).toContain("Approvals by agents: allowed in this workspace.");
    await client.close();
  });

  test.describe("without a linked GitHub account", () => {
    let account: { id: string; access_token_expires_at: Date | null; refresh_token_enc: string | null };

    test.beforeEach(async () => {
      [account] = (await sql()`
        select a.id, a.access_token_expires_at, a.refresh_token_enc from github_accounts a
        join users u on u.id = a.user_id where lower(u.email) = ${DEMO_USERS.member.email}`) as unknown as (typeof account)[];
      // An expired token that can't be refreshed leaves no usable credential.
      await sql()`update github_accounts set access_token_expires_at = now(), refresh_token_enc = null where id = ${account.id}`;
    });
    test.afterEach(async () => {
      await sql()`update github_accounts set access_token_expires_at = ${account.access_token_expires_at}, refresh_token_enc = ${account.refresh_token_enc} where id = ${account.id}`;
    });

    test("comments go through the connection, and resolving and requesting changes are refused", async () => {
      const client = await connect(await apiToken("member", "e2e review agent"));
      const reply = await call(client, "reply_to_review_comment", { pr: PR, comment_id: 2001006, body: "Thanks, makes sense." });
      expect(reply.isError).toBe(false);
      expect(reply.text).toContain(
        `Replied on src/lib/cart.ts:${(await mockGitHub.state()).reviewComments.find((c) => c.id === 2001005)!.line} through the workspace connection (storefront-bot), with a "Posted by Sam Okafor via Omakaze" line.`,
      );
      // Replies go to the thread's root comment, as GitHub requires.
      const [posted] = await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/comments/2001005/replies" });
      expect(posted.user).toBe("storefront-bot");
      expect((posted.body as { body: string }).body).toBe(
        `Thanks, makes sense.\n\n<sub>Posted by Sam Okafor via [Omakaze](${E2E.appUrl}/w/demo/acme/storefront/pull/128)</sub>`,
      );

      const resolve = await call(client, "resolve_review_thread", { pr: PR, comment_id: 2001005 });
      expect(resolve).toEqual({
        text: `Resolving conversations needs the user's own linked GitHub account; Omakaze never does it through the workspace connection. Link one at ${E2E.appUrl}/account, or ask the user to do it on GitHub.`,
        isError: true,
      });
      expect(await graphqlCalls("resolveReviewThread")).toHaveLength(0);
      const changes = await call(client, "submit_review", { pr: PR, event: "REQUEST_CHANGES", body: "Please add a test." });
      expect(changes.isError).toBe(true);
      expect(changes.text).toContain("Requesting changes needs the user's own linked GitHub account");
      expect(await mockGitHub.requests({ method: "POST", path: "/repos/acme/storefront/pulls/128/reviews" })).toHaveLength(0);
      await client.close();
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("shows the agent review settings", async ({ page }) => {
      await page.goto(`${demoPaths.settings}/tokens`);
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Reviews by agents" }) });
      await expect(panel).toContainText("resolve_review_thread");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // The panel's top just below the sticky app header, as a phone shows it.
      await panel.evaluate((el) => {
        const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - header - 12);
      });
      await shot(page, "mobile-settings-reviews-by-agents");
    });
  });
});
