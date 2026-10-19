import { DEMO_PRS, demoPaths, expect, test } from "./fixtures";
import { pause, shot } from "./media";

test.describe("Guide editor", () => {
  test("opens the editor for the latest version", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(demoPaths.edit(DEMO_PRS.main, 2));
    await expect(page.getByText("Edit guide · v2 · ready")).toBeVisible();
    await expect(page.getByText("413/413 changed lines covered (100%).")).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true }).first()).toHaveValue("Apply promo codes at checkout");
    await expect(page.locator("section").filter({ hasText: "Other changes" }).getByText("automatic")).toBeVisible();
    await shot(page, "guide-editor");
    await pause(page);
  });
});
