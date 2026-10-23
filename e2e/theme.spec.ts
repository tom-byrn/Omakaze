import { DEMO_PRS, demoPaths, expect, test } from "./fixtures";

const theme = (page: import("@playwright/test").Page) => page.locator("html");

test.describe("Theme", () => {
  test("follows the system theme until a member picks one, and keeps the landing page light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(demoPaths.pull(DEMO_PRS.main, { section: 2 }));
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("figure.md-mermaid .mermaid-dark svg")).toBeVisible();

    await page.emulateMedia({ colorScheme: "light" });
    await expect(theme(page)).toHaveAttribute("data-theme", "light");

    await page.getByLabel("Account menu").click();
    const switcher = page.getByRole("radiogroup", { name: "Theme" });
    await expect(switcher.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    await switcher.getByRole("radio", { name: "Dark" }).click();
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    await expect(switcher.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    // The choice is kept in this browser and applied before the first paint.
    await page.reload();
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");

    await page.goto("/");
    await expect(theme(page)).toHaveAttribute("data-theme", "light");

    await page.goto(demoPaths.account);
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "System" }).click();
    await expect(theme(page)).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("omakaze:theme"))).toBeNull();
  });
});
