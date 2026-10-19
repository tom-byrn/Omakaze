import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { sql } from "./db";
import { DEMO_USERS, DEMO_WORKSPACE, E2E, expect, test, type DemoUserKey } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";

const INSIGHTS = `/w/${DEMO_WORKSPACE.slug}/insights`;
const csvUrl = (panel: string, q = "") => `/api/w/${DEMO_WORKSPACE.slug}/insights/${panel}${q}`;

/** A second repository with one guide, so the repository filter has something to tell apart. */
const ADMIN_REPO = { owner: "acme", name: "storefront-admin", fullName: "acme/storefront-admin", pr: 12, path: "src/admin/orders.ts" };

const newId = () => randomBytes(12).toString("base64url");

async function userId(user: DemoUserKey): Promise<string> {
  const [row] = await sql()`select id from users where lower(email) = ${DEMO_USERS[user].email}`;
  return row.id as string;
}

async function addAdminRepo(): Promise<void> {
  await removeAdminRepo();
  const [ws] = await sql()`select id from workspaces where slug = ${DEMO_WORKSPACE.slug}`;
  const [alex, sam] = [await userId("owner"), await userId("member")];
  const repo = newId();
  const snapshot = newId();
  const guide = newId();
  const section = newId();
  const head = "a".repeat(40);
  const base = "b".repeat(40);
  const patch = "@@ -0,0 +1,4 @@\n+export async function listOrders(storeId: string) {\n+  const rows = await db.select().from(orders).where(eq(orders.storeId, storeId));\n+  return rows;\n+}";
  await sql()`insert into repositories (id, workspace_id, github_id, owner, name, full_name, default_branch, html_url, last_synced_at)
    values (${repo}, ${ws.id}, 91100099, ${ADMIN_REPO.owner}, ${ADMIN_REPO.name}, ${ADMIN_REPO.fullName}, 'main', ${`https://github.com/${ADMIN_REPO.fullName}`}, '2100-01-01')`;
  await sql()`insert into pull_requests (id, repository_id, number, github_id, title, state, merged, head_ref, head_sha, base_ref, base_sha, html_url, github_created_at, github_updated_at, merged_at, closed_at)
    values (${newId()}, ${repo}, ${ADMIN_REPO.pr}, 93000012, 'List orders in the admin', 'closed', true, 'alex/admin-orders', ${head}, 'main', ${base},
      ${`https://github.com/${ADMIN_REPO.fullName}/pull/${ADMIN_REPO.pr}`}, now() - interval '2 days', now() - interval '20 hours', now() - interval '20 hours', now() - interval '20 hours')`;
  const files = [{ path: ADMIN_REPO.path, status: "added", additions: 4, deletions: 0, patch }];
  await sql()`insert into diff_snapshots (id, repository_id, pr_number, head_sha, base_sha, merge_base_sha, files)
    values (${snapshot}, ${repo}, ${ADMIN_REPO.pr}, ${head}, ${base}, ${base}, ${sql().json(files)})`;
  await sql()`insert into guides (id, workspace_id, repository_id, pr_number, version, snapshot_id, status, source, title, head_sha, created_by_user_id, created_via, author, changed_lines, covered_lines, published_at, created_at)
    values (${guide}, ${ws.id}, ${repo}, ${ADMIN_REPO.pr}, 1, ${snapshot}, 'ready', 'manual', 'List orders in the admin', ${head}, ${alex}, 'ui', 'Alex Morgan', 4, 4,
      now() - interval '1 day', now() - interval '1 day 20 minutes')`;
  await sql()`insert into guide_sections (id, guide_id, position, title, body, refs) values (${section}, ${guide}, 1, 'Order list', 'Lists the orders of a store.', ${sql().json([{ path: ADMIN_REPO.path }])})`;
  await sql()`insert into section_reviews (section_id, guide_id, user_id, reviewed_at) values (${section}, ${guide}, ${sam}, now() - interval '22 hours')`;
  for (const [i, body] of ["Paginate this?", "Should this filter by status?", "Missing an index on store_id."].entries()) {
    await sql()`insert into comments (id, workspace_id, repository_id, pr_number, guide_id, section_id, author_user_id, kind, path, line, side, body, github_id, created_at)
      values (${newId()}, ${ws.id}, ${repo}, ${ADMIN_REPO.pr}, ${guide}, ${section}, ${sam}, 'review', ${ADMIN_REPO.path}, ${i + 1}, 'RIGHT', ${body}, ${4_090_000 + i}, now() - interval '21 hours')`;
  }
}

async function removeAdminRepo(): Promise<void> {
  await sql()`delete from guides where repository_id in (select id from repositories where full_name = ${ADMIN_REPO.fullName})`;
  await sql()`delete from repositories where full_name = ${ADMIN_REPO.fullName}`;
}

/** Guide versions the page should count: created in the range (today in UTC and the days before), not failed. */
async function guidesCreated(days: number, repo?: string): Promise<number> {
  const [row] = await sql()`
    select count(*)::int as n from guides g
    join workspaces w on w.id = g.workspace_id
    join repositories r on r.id = g.repository_id
    where w.slug = ${DEMO_WORKSPACE.slug} and g.status <> 'failed'
      and g.created_at >= date_trunc('day', now(), 'UTC') - make_interval(days => ${days - 1})
      and (${repo ?? null}::text is null or r.full_name = ${repo ?? null})`;
  return row.n as number;
}

const stat = (page: Page, key: string) => page.locator(`[data-stat="${key}"] p`).first();
const panel = (page: Page, id: string) => page.locator(`section#${id}`);
const wide = (page: Page, chart: string) => page.locator(`[data-chart="${chart}"] [data-chart-variant="wide"]`);

/** Hover the newest column of a chart that has data, and return its native tooltip text. */
async function hoverLastColumnWithData(chart: Locator, empty: RegExp): Promise<{ column: Locator; title: string }> {
  const columns = chart.locator("g.group");
  for (let i = (await columns.count()) - 1; i >= 0; i--) {
    const title = (await columns.nth(i).locator("title").textContent()) ?? "";
    if (empty.test(title)) continue;
    await columns.nth(i).locator("[data-hit]").hover();
    return { column: columns.nth(i), title };
  }
  throw new Error("No column with data");
}

test.describe("Insights", () => {
  test.beforeAll(addAdminRepo);
  test.afterAll(removeAdminRepo);

  test("shows how guides are written and reviewed", async ({ page }) => {
    test.setTimeout(E2E.demo ? 360_000 : 180_000);
    videoName("insights-walkthrough");
    await page.goto(`/w/${DEMO_WORKSPACE.slug}`);
    await caption(page, "Insights is a new page in the workspace navigation.");
    await pause(page, 1500);
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Insights" }).click();
    await expect(page).toHaveURL(new RegExp(`${INSIGHTS}$`));
    await expect(page.getByRole("heading", { name: "Insights." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");

    // The headline numbers agree with the database.
    await expect(page.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
    await expect(stat(page, "guides")).toHaveText(String(await guidesCreated(30)));
    await caption(page, "The last 30 days at a glance: guides created, review speed, completion and coverage.");
    await shot(page, "insights-overview");
    await pause(page, 3000);

    // Guides created, by source, with a tooltip per day.
    const guides = panel(page, "guides");
    await guides.scrollIntoViewIfNeeded();
    for (const source of ["MCP agent", "Built-in AI", "ChatGPT plan", "REST API", "Manual"]) {
      await expect(guides.getByRole("list", { name: "Legend" })).toContainText(source);
    }
    await caption(page, "Guides created per day, by who wrote them. Hover a day for the numbers.");
    const { column, title } = await hoverLastColumnWithData(wide(page, "Guides created by source"), /\. 0 guides$/);
    expect(title).toMatch(/MCP agent: \d+, Built-in AI: \d+, ChatGPT plan: \d+, REST API: \d+, Manual: \d+\. \d+ guides?$/);
    await expect(column.locator("g.pointer-events-none").first()).toHaveCSS("opacity", "1");
    await pause(page, 1200);
    await shot(page, "insights-guides-created-tooltip", { locator: guides });
    await pause(page, 1500);

    // Every chart has its table.
    await guides.getByText("Show table").click();
    const table = guides.getByRole("table", { name: "Guides created by source" });
    await expect(table.getByRole("row").last()).toContainText(String(await guidesCreated(30)));
    await pause(page, 1500);
    await guides.getByText("Show table").click();

    // Review speed: medians per week, carried-over marks left out.
    const speed = panel(page, "review-speed");
    await speed.scrollIntoViewIfNeeded();
    await caption(page, "Review speed: median time from publishing to the first review mark, and until every section has one.");
    await hoverLastColumnWithData(wide(page, "Median hours to review"), /First section reviewed: –/);
    await expect(speed).toContainText("marks carried over from an earlier version are left out");
    await pause(page, 1200);
    await shot(page, "insights-review-speed", { locator: speed });
    await pause(page, 2000);

    // Completion, unreviewed sections, coverage and template compliance.
    await panel(page, "completion").scrollIntoViewIfNeeded();
    await page.mouse.move(10, 300);
    await expect(panel(page, "completion")).toContainText("fully reviewed");
    await expect(panel(page, "unreviewed-sections").getByRole("table")).toContainText("Other changes");
    await expect(panel(page, "coverage")).toContainText("went to “Other changes”");
    await expect(panel(page, "templates")).toContainText("with a template miss a required section");
    await caption(page, "Completion, the sections reviewers skip, how much the author's sections cover, and template gaps.");
    await shot(page, "insights-completion-and-coverage", { locator: page.locator("#completion").locator("xpath=../..") });
    await pause(page, 3500);

    // Hot spots link to the sections where the discussion is.
    const hot = panel(page, "hot-sections");
    await hot.scrollIntoViewIfNeeded();
    await caption(page, "The sections and files with the most review comments, linked to where they were made.");
    await expect(panel(page, "hot-files").getByRole("table")).toContainText("src/lib/cart.ts");
    await shot(page, "insights-hot-spots", { locator: hot.locator("xpath=..") });
    await pause(page, 2500);

    // Members: owners and admins see everyone.
    const members = panel(page, "members");
    await members.scrollIntoViewIfNeeded();
    for (const name of ["Alex Morgan", "Maya Chen", "Sam Okafor", "Devon Ko", "Priya Shah", "Lena Fischer", "Team total"]) {
      await expect(members.getByRole("table")).toContainText(name);
    }
    await caption(page, "Per member: sections reviewed (carried-over marks counted apart), comments, reviews and resolved conversations.");
    await shot(page, "insights-members", { locator: members });
    await pause(page, 2500);

    // The time range.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await caption(page, "Switch the range: 7, 30 or 90 days.");
    await page.getByRole("link", { name: "7 days" }).click();
    await expect(page).toHaveURL(/days=7/);
    await expect(stat(page, "guides")).toHaveText(String(await guidesCreated(7)));
    await pause(page, 1500);
    await page.getByRole("link", { name: "90 days" }).click();
    await expect(page).toHaveURL(/days=90/);
    await expect(stat(page, "guides")).toHaveText(String(await guidesCreated(90)));
    await expect(panel(page, "guides")).toContainText("per week in the last 90 days");
    await pause(page, 2000);

    // The repository filter scopes every panel.
    await caption(page, "Filter by repository: every panel follows.");
    await page.getByLabel("Repository").selectOption(ADMIN_REPO.fullName);
    await expect(page).toHaveURL(/repo=acme%2Fstorefront-admin/);
    await expect(stat(page, "guides")).toHaveText("1");
    await expect(panel(page, "hot-files").getByRole("table")).toContainText(ADMIN_REPO.path);
    await expect(panel(page, "hot-files").getByRole("table")).not.toContainText("src/lib/cart.ts");
    await expect(panel(page, "members").getByRole("row", { name: /Sam Okafor/ })).toContainText("3");
    await pause(page, 1500);
    await shot(page, "insights-repository-filter");
    await page.getByLabel("Repository").selectOption("acme/storefront");
    await expect(page).toHaveURL(/repo=acme%2Fstorefront(&|$)/);
    await expect(stat(page, "guides")).toHaveText(String(await guidesCreated(90, "acme/storefront")));
    await pause(page, 1500);

    // Download the table behind a panel.
    await caption(page, "Each panel downloads its table as CSV, with the same range and repository.");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Guides created as CSV" }).click()]);
    expect(download.suggestedFilename()).toBe("demo-guides-90d-acme-storefront.csv");
    const lines = readFileSync((await download.path())!, "utf8").trim().split("\r\n");
    expect(lines[0]).toBe("week_starting,MCP agent,Built-in AI,ChatGPT plan,REST API,Manual,total");
    const total = lines.slice(1).reduce((n, l) => n + Number(l.split(",").at(-1)), 0);
    expect(total).toBe(await guidesCreated(90, "acme/storefront"));
    await pause(page, 1500);

    // A hot spot opens the section.
    const first = panel(page, "hot-sections").getByRole("table").getByRole("link").first();
    const sectionTitle = (await first.locator("span").first().textContent())!;
    await caption(page, "A hot spot opens the section it is about.");
    await first.click();
    await expect(page).toHaveURL(/\/pull\/\d+\?v=\d+&section=\d+/);
    await expect(page.getByRole("heading", { name: sectionTitle, exact: true }).first()).toBeVisible();
    await pause(page, 2500);
    await caption(page);
  });

  test("CSV files have the panel's rows and the same access checks", async ({ page, playwright }) => {
    const res = await page.request.get(csvUrl("members", "?days=90"));
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toBe('attachment; filename="demo-members-90d.csv"');
    const rows = (await res.text()).trim().split("\r\n");
    expect(rows[0]).toBe("member,sections_reviewed,marks_carried_over,comments,reviews_submitted,conversations_resolved,guides_started");
    expect(rows.length).toBeGreaterThanOrEqual(8);

    // Review marks in the CSV are the database's: fresh and carried-over ones apart.
    const [marks] = await sql()`
      select count(*) filter (where r.carried_from_version is null)::int as fresh, count(*) filter (where r.carried_from_version is not null)::int as carried
      from section_reviews r join guides g on g.id = r.guide_id join workspaces w on w.id = g.workspace_id
      where w.slug = ${DEMO_WORKSPACE.slug} and r.reviewed_at >= date_trunc('day', now(), 'UTC') - interval '89 days'`;
    const totalRow = rows.at(-1)!.split(",");
    expect(totalRow[0]).toBe("Team total");
    expect(Number(totalRow[1])).toBe(marks.fresh);
    expect(Number(totalRow[2])).toBe(marks.carried);

    expect((await page.request.get(csvUrl("nothing"))).status()).toBe(404);
    expect((await page.request.get(csvUrl("guides", "?repo=acme/unknown"))).status()).toBe(404);
    // Signed out: no CSV.
    const anonymous = await playwright.request.newContext({ baseURL: E2E.appUrl, storageState: { cookies: [], origins: [] } });
    expect((await anonymous.get(csvUrl("guides"))).status()).toBe(401);
    await anonymous.dispose();
  });

  test.describe("as a member", () => {
    test.use({ user: "member" });

    test("shows the member's own numbers and the team total", async ({ page }) => {
      await page.goto(`${INSIGHTS}?days=90`);
      const members = panel(page, "members");
      await expect(members).toContainText("Owners and admins see every member.");
      const rows = members.getByRole("table").getByRole("row");
      // Header, Sam and the team total.
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(1)).toContainText("Sam Okafor");
      await expect(rows.nth(2)).toContainText("Team total");
      await members.scrollIntoViewIfNeeded();
      await shot(page, "insights-members-as-member", { locator: members });

      const csv = (await (await page.request.get(csvUrl("members", "?days=90"))).text()).trim().split("\r\n");
      expect(csv.map((l) => l.split(",")[0])).toEqual(["member", "Sam Okafor", "Team total"]);
    });

    test("fits a phone screen", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(INSIGHTS);
      await expect(page.getByRole("heading", { name: "Insights." })).toBeVisible();
      await expect(page.locator('[data-chart="Guides created by source"] [data-chart-variant="narrow"] svg')).toBeVisible();
      await expect(page.locator('[data-chart="Guides created by source"] [data-chart-variant="wide"]')).toBeHidden();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
      await shot(page, "insights-mobile");
      await page.evaluate(() => document.getElementById("guides")?.scrollIntoView({ block: "center" }));
      await shot(page, "insights-mobile-chart");
    });
  });
});
