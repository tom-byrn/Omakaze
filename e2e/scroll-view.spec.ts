import type { Page } from "@playwright/test";
import { clearReviewMarks } from "./db";
import { DEMO_PRS, demoPaths, expect, test, viewOption } from "./fixtures";
import { caption, pause, shot } from "./media";

/** Scroll the guide's scroll view with the mouse wheel over the code, in small steps. */
async function scrollCode(page: Page, px: number, step = 120) {
  await page.mouse.move(1000, 600);
  for (let done = 0; done < Math.abs(px); done += step) {
    await page.mouse.wheel(0, Math.sign(px) * step);
    await page.waitForTimeout(60);
  }
}

test.describe("Guide scroll view", () => {
  test.beforeEach(() => clearReviewMarks("owner", DEMO_PRS.main, 2));
  test.afterEach(() => clearReviewMarks("owner", DEMO_PRS.main, 2));

  test("shows every section on one page", async ({ page }) => {
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
    await caption(page, "The section view shows one section at a time", "Section view");
    await pause(page, 1200);

    // The layout is one of the view options behind the gear.
    await caption(page, "The gear holds the view options: layout, all files, resolved, wrapping", "View options");
    await expect(await viewOption(page, "Sections")).toHaveAttribute("aria-checked", "true");
    await shot(page, "guide-view-options");
    await pause(page, 1500);

    // Switch to the scroll view: every section is on the page, one after another.
    await (await viewOption(page, "Scroll")).click();
    await expect(page.getByRole("menu", { name: "View options" })).toBeHidden();
    await expect(page.getByText(/^Section \d\d \/ 06$/)).toHaveCount(6);
    await caption(page, "The scroll view puts every section on one page", "Scroll view");
    await shot(page, "guide-scroll-overview");
    await pause(page, 1500);

    // Scrolling moves through the sections; the stepper and the URL follow.
    const tabs = page.getByRole("navigation", { name: "Guide sections" });
    const header = page.getByRole("button", { name: "Copy agent prompt" });
    await expect(header).toBeInViewport();
    await caption(page, "Scroll down: the header scrolls away, the explanation stays next to its code", "Scroll view");
    await expect(async () => {
      await scrollCode(page, 480);
      await expect(page).toHaveURL(/section=1/, { timeout: 500 });
    }).toPass();
    await expect(tabs.getByRole("button", { name: /Promo codes table/ })).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("heading", { level: 2, name: "Promo codes table" })).toBeInViewport();
    // The pull request's header has scrolled away; the stepper stays at the top.
    await expect(header).not.toBeInViewport();
    await expect(tabs).toBeInViewport();
    await pause(page, 600);
    await expect(async () => {
      await scrollCode(page, 480);
      await expect(page).toHaveURL(/section=2/, { timeout: 500 });
    }).toPass();
    await expect(tabs.getByRole("button", { name: /Validating a code/ })).toHaveAttribute("aria-current", "step");
    await pause(page, 400);
    // A long explanation scrolls with the page and then stays in view while its code continues.
    await scrollCode(page, 1200);
    await expect(page.getByRole("region", { name: "Validating a code" }).getByRole("button", { name: "Mark reviewed and continue" })).toBeInViewport();
    await shot(page, "guide-scroll-sticky");
    await pause(page, 1200);

    // The stepper jumps to a section.
    await caption(page, "The stepper still jumps straight to a section", "Scroll view");
    await tabs.getByRole("button", { name: /Discounts in cart totals/ }).click();
    await expect(page).toHaveURL(/section=3/);
    await expect(page.getByRole("heading", { level: 2, name: "Discounts in cart totals" })).toBeInViewport();
    await pause(page, 1200);

    // Diff links focus the code of their own section.
    const totals = page.getByRole("region", { name: "Discounts in cart totals" });
    await totals.getByRole("link", { name: "totals", exact: true }).first().click();
    await expect(totals.locator('.diff-file[data-path="src/lib/cart.ts"]')).toContainText("export function totals");
    await pause(page, 1200);

    // Marking a section reviewed scrolls on to the next one.
    await caption(page, "Mark reviewed and continue scrolls on to the next section", "Review");
    await totals.getByRole("button", { name: "Mark reviewed and continue" }).click();
    await expect(page.getByText("1/6 reviewed")).toBeVisible();
    await expect(page).toHaveURL(/section=4/);
    await expect(page.getByRole("heading", { level: 2, name: "Checkout endpoint" })).toBeInViewport();
    await pause(page, 1200);

    // Arrow keys move between sections too.
    await caption(page, "Arrow keys and R work as in the section view", "Keyboard");
    await page.keyboard.press("r");
    await expect(page.getByText("2/6 reviewed")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/section=5/);
    await expect(page.getByRole("heading", { level: 2, name: "Promo code field" })).toBeInViewport();
    await pause(page, 1200);

    // The choice is remembered, and a reload returns to the same section.
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "Promo code field" })).toBeInViewport();
    await expect(await viewOption(page, "Scroll")).toHaveAttribute("aria-checked", "true");

    // Back to the section view, at the same section.
    await caption(page, "Switch back any time; you stay on the same section", "Section view");
    await pause(page, 800);
    await (await viewOption(page, "Sections")).click();
    await expect(page.getByText("Section 05 / 06")).toBeVisible();
    await expect(page.getByText(/^Section \d\d \/ 06$/)).toHaveCount(1);
    await pause(page, 1500);
    await caption(page);
  });
});
