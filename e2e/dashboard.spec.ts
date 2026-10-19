import { DEMO_PRS, demoPaths, expect, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("Dashboard", () => {
  test("lists the seeded pull requests", async ({ page }) => {
    await page.goto(demoPaths.dashboard);
    await expect(page.getByRole("heading", { name: "Pull requests." })).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Filter by state" });
    await expect(tabs.getByRole("link", { name: /Open\s*4/ })).toBeVisible();

    const row = (n: number) => page.getByRole("listitem").filter({ hasText: `#${n}` });
    await expect(row(DEMO_PRS.main)).toContainText("Apply promo codes at checkout");
    await expect(row(DEMO_PRS.main)).toContainText("Guide v2");
    await expect(row(DEMO_PRS.outdated)).toContainText("Guide v1 · outdated");
    await expect(row(DEMO_PRS.draft)).toContainText("draft");
    await expect(row(DEMO_PRS.noGuide).getByRole("button", { name: "Copy prompt" })).toBeVisible();
    await shot(page, "dashboard");
    await pause(page);

    await tabs.getByRole("link", { name: /Merged/ }).click();
    await expect(page).toHaveURL(/state=merged/);
    await expect(row(DEMO_PRS.merged)).toContainText("Send order confirmation emails");
    await pause(page);

    await tabs.getByRole("link", { name: /Closed/ }).click();
    await expect(row(DEMO_PRS.closed)).toContainText("Experiment: one-page checkout");
    await pause(page);
  });

  test("searches pull requests", async ({ page }) => {
    await page.goto(demoPaths.dashboard);
    await page.getByPlaceholder("Search title, author, branch or #number").fill("promo");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=promo/);
    await expect(page.getByRole("listitem").filter({ hasText: "#128" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "#129" })).toHaveCount(0);
  });

  test("shows the repository page", async ({ page }) => {
    await page.goto(demoPaths.repo);
    await expect(page.getByRole("heading", { name: "acme/storefront." })).toBeVisible();
    await expect(page.getByText("Acme's online store: catalog, cart and checkout.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "#128" })).toBeVisible();
  });
});
