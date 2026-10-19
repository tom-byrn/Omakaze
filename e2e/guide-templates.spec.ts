import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { starterTemplate } from "../src/lib/guides/templates";
import { sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_USERS, DEMO_WORKSPACE, demoPaths, E2E, expect, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";

const TEMPLATE_SETTINGS = `${demoPaths.settings}/template`;
const REPO_SETTINGS = `${demoPaths.repo}/settings`;
const PR = `${DEMO_REPO.fullName}#${DEMO_PRS.noGuide}`;
const TOKEN_NAME = "e2e guide templates";

/** Undo everything the specs change: templates, instructions, guides on #131, tokens and activity. */
async function resetTemplates() {
  const db = sql();
  const [ws] = await db`select id from workspaces where slug = ${DEMO_WORKSPACE.slug}`;
  await db`update workspaces set guide_template = null, ai_instructions = null where id = ${ws.id}`;
  await db`update repositories set guide_template = null where workspace_id = ${ws.id}`;
  await db`delete from guides where workspace_id = ${ws.id} and pr_number = ${DEMO_PRS.noGuide}`;
  await db`delete from diff_snapshots where pr_number = ${DEMO_PRS.noGuide} and repository_id in (select id from repositories where workspace_id = ${ws.id})`;
  await db`delete from activity where workspace_id = ${ws.id} and (pr_number = ${DEMO_PRS.noGuide} or data->>'section' like '%guide template')`;
  await db`delete from api_tokens where name = ${TOKEN_NAME}`;
}

/** An API token for the owner, created in the database like Settings → API tokens does. */
async function ownerToken(): Promise<string> {
  const token = `omk_${randomBytes(24).toString("base64url")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    select ${randomBytes(8).toString("hex")}, u.id, w.id, ${TOKEN_NAME}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}
    from users u, workspaces w where lower(u.email) = ${DEMO_USERS.owner.email} and w.slug = ${DEMO_WORKSPACE.slug}`;
  return token;
}

/** Full-page screenshot from the top, so the sticky header is not captured mid-page. */
async function fullShot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, name, { fullPage: true });
}

/** Scroll an element to just below the sticky header. */
async function scrollTo(locator: Locator) {
  await locator.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 88));
}

/** One JSON-RPC call to the MCP endpoint (stateless, JSON responses). */
async function mcp(request: APIRequestContext, token: string, method: string, params: Record<string, unknown>) {
  const res = await request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).result;
}

test.describe("Guide templates", () => {
  // Starting a guide reads the pull request from GitHub.
  test.skip(E2E.github !== "mock", "needs E2E_GITHUB=mock");
  test.beforeEach(resetTemplates);
  test.afterEach(resetTemplates);

  test("a workspace template from the settings to a published guide", async ({ page }) => {
    videoName("guide-templates-walkthrough");
    page.on("dialog", (d) => void d.accept());

    await page.goto(TEMPLATE_SETTINGS);
    await caption(page, "Settings → Guide template: the outline every guide in the workspace follows");
    await expect(page.getByRole("button", { name: /^None/ })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "template-settings-empty");
    await pause(page);

    await page.getByRole("button", { name: /^Feature/ }).click();
    await expect(page.getByLabel("Section 1 title")).toHaveValue("Data model");
    await expect(page.getByLabel("Section 4 title")).toHaveValue("Tests");
    await caption(page, "Start from a built-in starter: Feature, Bug fix or Migration. Then adjust it.");
    await pause(page);
    await page.getByLabel("Template name").fill("Storefront feature");
    await page.getByLabel("Section 4 guidance").fill("Unit tests in tests/, and an e2e spec for anything a shopper clicks.");
    await page.getByLabel("Section 5 required").check();
    await expect(page.getByText("Custom outline")).toBeVisible();
    await page.getByLabel("Writing instructions").fill("Write in British English. Link the issue in the summary.");
    await caption(page, "Mark sections as required and add writing instructions");
    await fullShot(page, "template-workspace-settings");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status")).toContainText("Saved. New guides use this template.");

    const [ws] = await sql()`select guide_template, ai_instructions from workspaces where slug = ${DEMO_WORKSPACE.slug}`;
    expect(ws.guide_template.name).toBe("Storefront feature");
    expect(ws.guide_template.sections.map((s: { title: string }) => s.title)).toEqual(["Data model", "Core logic", "API and UI", "Tests", "Rollout"]);
    expect(ws.guide_template.sections[4]).toMatchObject({ title: "Rollout", required: true });
    expect(ws.ai_instructions).toBe("Write in British English. Link the issue in the summary.");

    const preview = page.locator("section").filter({ has: page.getByRole("heading", { name: "What writers receive" }) });
    await expect(preview).toContainText('Guide template "Storefront feature" (workspace default):');
    await expect(preview).toContainText("5. Rollout (required)");
    await expect(preview).toContainText("Writing instructions:");
    await preview.scrollIntoViewIfNeeded();
    await caption(page, "The built-in AI and agents over MCP receive the outline in order, with what is required");
    await shot(page, "template-what-writers-receive", { locator: preview });
    await pause(page, 1500);

    // The editor starts a manual guide from the template.
    await page.goto(demoPaths.pull(DEMO_PRS.noGuide));
    await caption(page, "Writing a guide by hand starts from the template");
    await page.getByRole("button", { name: "Start a draft" }).click();
    await expect(page).toHaveURL(/\/pull\/131\/edit\?v=1$/);
    const editors = page.locator('section[id^="section-"]');
    await expect(editors).toHaveCount(5);
    const core = editors.filter({ hasText: "Core logic" });
    await expect(core.locator('textarea[name="body"]')).toHaveAttribute("placeholder", /^Required\. The main behaviour change/);
    await expect(editors.filter({ hasText: "Tests" }).locator('textarea[name="body"]')).toHaveAttribute("placeholder", /an e2e spec for anything a shopper clicks/);
    const checklist = page.getByRole("list", { name: "Template sections" });
    await expect(checklist.getByRole("listitem").filter({ hasText: "Core logic" })).toContainText("Missing");
    await caption(page, "The checklist tracks which template sections are written");
    await shot(page, "template-editor-prefilled");
    await pause(page, 1200);
    await scrollTo(editors.first());
    await caption(page, "Each pre-filled section shows its guidance as placeholder text");
    await shot(page, "template-editor-placeholders");
    await pause(page, 1200);

    await core.locator('textarea[name="body"]').fill("Product images go through the CDN resizer. `imageUrl()` builds the URL from the width and quality.");
    await core.locator('textarea[name="refs"]').fill("src/lib/images.ts");
    await core.getByRole("button", { name: "Save section" }).click();
    await expect(core.getByRole("status")).toContainText("Saved");
    await expect(checklist.getByRole("listitem").filter({ hasText: "Core logic" })).toContainText("Written");
    await checklist.scrollIntoViewIfNeeded();
    await pause(page);

    await caption(page, "Publish: template sections left empty are not published");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page).toHaveURL(/\/pull\/131\?v=1$/);
    const [guide] = await sql()`select id, status, template from guides where pr_number = ${DEMO_PRS.noGuide} and version = 1`;
    expect(guide.status).toBe("ready");
    expect(guide.template).toMatchObject({ name: "Storefront feature", source: "workspace" });
    const titles = await sql()`select title from guide_sections where guide_id = ${guide.id} order by position`;
    expect(titles.map((r) => r.title)).toEqual(["Core logic", "Other changes"]);

    const notice = page.getByRole("note", { name: "Missing template sections" });
    await expect(notice).toContainText("Missing from the Storefront feature template: Tests, Rollout.");
    await caption(page, "Members see which required sections the guide is missing");
    await shot(page, "template-viewer-missing-sections");
    await pause(page, 1500);

    // Fill one gap in the editor; the notice follows.
    await notice.getByRole("link", { name: "Add them in the editor" }).click();
    await expect(page).toHaveURL(/\/pull\/131\/edit\?v=1$/);
    const add = page.locator("section").filter({ has: page.getByRole("heading", { name: "Add a section" }) });
    await add.getByLabel("Title").fill("Tests");
    await add.locator('textarea[name="body"]').fill("`tests/images.test.ts` covers widths above the original size.");
    await caption(page, "Add the missing section in the editor");
    await add.getByRole("button", { name: "Add section" }).click();
    await expect(add.getByRole("status")).toContainText("Section added.");
    await expect(checklist.getByRole("listitem").filter({ hasText: "Tests" })).toContainText("Written");
    await page.getByRole("link", { name: "View guide" }).click();
    await expect(notice).toContainText("Missing from the Storefront feature template: Rollout.");
    await caption(page, "Only Rollout is still missing");
    await pause(page, 1500);
  });

  test("a repository template reaches agents over MCP and the REST API", async ({ page, request, loginAs }) => {
    videoName("guide-templates-repository-and-agents");
    await sql()`update workspaces set guide_template = ${sql().json(starterTemplate("feature")!)}, ai_instructions = 'Write in British English.' where slug = ${DEMO_WORKSPACE.slug}`;

    await page.goto(REPO_SETTINGS);
    await caption(page, "Repository settings: use the workspace template, or an outline of its own");
    await expect(page.getByRole("button", { name: /^Workspace template/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^Workspace template/ })).toContainText("Feature · 5 sections");
    await pause(page);
    await page.getByRole("button", { name: /^Own outline/ }).click();
    // A new outline starts as a copy of the workspace's.
    await expect(page.getByRole("button", { name: /^Feature/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Bug fix/ }).click();
    await expect(page.getByLabel("Section 1 title")).toHaveValue("The bug");
    await page.getByLabel("Additional instructions for this repository").fill("Link the incident or issue the fix closes.");
    await caption(page, "This repository mostly gets fixes: use the Bug fix starter and add an instruction");
    await fullShot(page, "template-repository-settings");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status")).toContainText("Saved. New guides in this repository use this template.");
    const preview = page.locator("section").filter({ has: page.getByRole("heading", { name: "What writers receive" }) });
    await expect(preview).toContainText('Guide template "Bug fix" (set for this repository):');
    await expect(preview).toContainText("Write in British English.\n\nLink the incident or issue the fix closes.");
    const [repo] = await sql()`select guide_template from repositories where full_name = ${DEMO_REPO.fullName}`;
    expect(repo.guide_template).toMatchObject({ outline: { name: "Bug fix" }, instructions: "Link the incident or issue the fix closes." });
    await preview.scrollIntoViewIfNeeded();
    await pause(page, 1200);

    // Agents read the template in get_pull_request and the create_guided_pr prompt.
    const token = await ownerToken();
    const pull = await mcp(request, token, "tools/call", { name: "get_pull_request", arguments: { pr: PR } });
    const pullText = pull.content[0].text as string;
    expect(pullText).toContain('Guide template "Bug fix" (set for this repository):');
    expect(pullText).toContain("1. The bug (required): Symptoms");
    expect(pullText).toContain("Writing instructions:\nWrite in British English.\n\nLink the incident");
    const prompt = await mcp(request, token, "prompts/get", { name: "create_guided_pr", arguments: { pr_url: `https://github.com/${DEMO_REPO.fullName}/pull/${DEMO_PRS.noGuide}` } });
    expect(prompt.messages[0].content.text).toContain('Guide template "Bug fix"');

    // create_guide publishes, and warns about missing required sections.
    const created = await mcp(request, token, "tools/call", {
      name: "create_guide",
      arguments: { pr: PR, summary: "Serves product images through the CDN resizer.", sections: [{ title: "Fix", body: "Clamp the width.", refs: ["src/lib/images.ts"] }] },
    });
    expect(created.isError).toBeFalsy();
    expect(created.content[0].text).toContain('Template warning: the "Bug fix" template requires "The bug", "Root cause", "Regression test", which are missing.');

    // So does POST /api/v1/guides.
    const res = await request.post("/api/v1/guides", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        pr: PR,
        summary: "Serves product images through the CDN resizer.",
        sections: [
          { title: "The bug", body: "Product pages load full-size images." },
          { title: "Root cause", body: "Image URLs pointed at the original files." },
          { title: "Fix", body: "`imageUrl()` asks the resizer for the displayed width.", refs: ["src/lib/images.ts"] },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(2);
    expect(body.template).toEqual({ name: "Bug fix", source: "repository", missing_required: ["Regression test"] });

    // Members see the gap; the settings are read-only for them.
    await loginAs("member");
    await page.goto(demoPaths.pull(DEMO_PRS.noGuide));
    await expect(page.getByRole("note", { name: "Missing template sections" })).toContainText("Missing from the Bug fix template: Regression test.");
    await caption(page, "A guide from the REST API without a regression test: members see it is missing");
    await shot(page, "template-viewer-member");
    await pause(page, 1500);
    await page.goto(REPO_SETTINGS);
    await expect(page.getByText("This repository uses its own outline. Only admins can change it.")).toBeVisible();
    await caption(page, "Members can read the template but not change it");
    await pause(page);

    // Narrow screens.
    await loginAs("owner");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TEMPLATE_SETTINGS);
    await expect(page.getByRole("button", { name: /^Feature/ })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await fullShot(page, "template-settings-mobile-full");
    await scrollTo(page.getByText("Sections, in reading order"));
    await shot(page, "template-settings-mobile");
  });
});
