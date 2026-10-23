import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { request as playwrightRequest, type Page } from "@playwright/test";
import { guideId, sql } from "./db";
import { DEMO_PRS, DEMO_REPO, DEMO_SHAS, DEMO_USERS, DEMO_WORKSPACE, demoPaths, E2E, expect, test } from "./fixtures";
import { caption, pause, shot, videoName } from "./media";

const PRINT = `${demoPaths.pull(DEMO_PRS.main)}/print`;
const TOKEN_NAME = "e2e export";
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** An API token for the owner, created in the database like Settings → API tokens does. */
async function ownerToken(): Promise<string> {
  const token = `omk_${randomBytes(24).toString("base64url")}`;
  await sql()`
    insert into api_tokens (id, user_id, workspace_id, name, kind, token_hash, token_prefix)
    select ${randomBytes(8).toString("hex")}, u.id, w.id, ${TOKEN_NAME}, 'personal', ${createHash("sha256").update(token).digest("hex")}, ${token.slice(0, 12)}
    from users u, workspaces w where lower(u.email) = ${DEMO_USERS.owner.email} and w.slug = ${DEMO_WORKSPACE.slug}`;
  return token;
}

/** Save a file next to the screenshots (no-op without MEDIA_DIR). */
function saveMedia(name: string, data: string | Buffer): string | null {
  if (!E2E.mediaDir) return null;
  mkdirSync(E2E.mediaDir, { recursive: true });
  const file = path.join(E2E.mediaDir, name);
  writeFileSync(file, data);
  return file;
}

/** The first page of a PDF whose text contains `text`, found with poppler's pdftotext (null without it). */
function pdfPageWith(pdf: string, pages: number, text: string): number | null {
  for (let p = 1; p <= pages; p++) {
    const out = spawnSync("pdftotext", ["-f", String(p), "-l", String(p), "-layout", pdf, "-"], { encoding: "utf8" });
    if (out.status !== 0) return null;
    if (out.stdout.toLowerCase().includes(text.toLowerCase())) return p;
  }
  return null;
}

/** A PNG of one PDF page, when poppler's pdftoppm is installed (like ffmpeg for the videos). */
function pdfPage(pdf: string, page: number, name: string) {
  spawnSync("pdftoppm", ["-png", "-r", "110", "-f", String(page), "-l", String(page), "-singlefile", pdf, path.join(E2E.mediaDir!, name)], { stdio: "ignore" });
}

/** The downloaded file, shown as a page of plain text, so the walkthrough video can show it. */
async function showText(page: Page, title: string, text: string) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await page.setContent(
    `<title>${escape(title)}</title><body style="margin:0;background:#f4f4f3;font:13px/1.55 ui-monospace,Menlo,monospace;color:#141518">
      <div style="padding:10px 24px;border-bottom:1px dashed #d4d4d4;background:#fcfcfc;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#727272">${escape(title)}</div>
      <pre style="margin:24px;padding:24px 28px;background:#fff;border:1px solid rgba(0,0,0,.15);white-space:pre-wrap">${escape(text)}</pre></body>`,
  );
}

/** Scroll an element of the print layout to just below its sticky bar. */
async function scrollToTop(page: Page, selector: string) {
  await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const bar = document.querySelector(".print-controls")?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 16 });
    });
}

test.describe("Export", () => {
  test("downloads a guide as Markdown and prints it as a PDF", async ({ page, context }) => {
    // Renders the whole guide several times (popup, print layout, a 20-page PDF).
    test.slow();
    videoName("export-walkthrough");
    // Count print dialogs instead of opening them.
    await context.addInitScript(() => {
      const w = window as unknown as { __prints: number; print: () => void };
      w.__prints = 0;
      w.print = () => {
        w.__prints++;
      };
    });

    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await expect(page.getByText("Guided PR · v2")).toBeVisible();
    await caption(page, "Any guide version can be exported from the bar above the guide", "Export");
    await pause(page);
    await page.locator("summary").filter({ hasText: "Export" }).click();
    const menu = page.getByRole("menu", { name: "Export" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText([/^Markdown/, /^Markdown with images/, /^PDF \(print\)/]);
    await caption(page, "Markdown, Markdown with the images inside, or a print layout to save as a PDF", "Export");
    await shot(page, "export-menu");
    await pause(page, 1500);

    // Markdown: one file with the sections and their diffs.
    const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("menuitem", { name: "Markdown", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("acme-storefront-pr128-v2.md");
    await expect(menu).toBeHidden();
    const md = readFileSync((await download.path())!, "utf8");
    saveMedia("acme-storefront-pr128-v2.md", md);
    expect(md.startsWith("# Apply promo codes at checkout\n")).toBe(true);
    expect(md).toContain(`[${DEMO_REPO.fullName}#${DEMO_PRS.main}](https://github.com/acme/storefront/pull/128)`);
    expect(md).toContain(`- **Head commit:** [\`${DEMO_SHAS.pr128v2.slice(0, 7)}\`](https://github.com/acme/storefront/commit/${DEMO_SHAS.pr128v2})`);
    expect(md).toContain("- **Guide:** version 2, ready, written by");
    expect(md).toContain("- [1. Promo codes table](#1-promo-codes-table)");
    expect(md).toContain("## Overview\n\nCustomers can now enter a promo code in the cart.");
    expect(md).toContain("## 1. Promo codes table\n\n2 files · +48 −1");
    expect(md).toContain("#### `db/migrations/0018_promo_codes.sql`\n\nAdded · +20 −0");
    expect(md).toContain('```diff\n--- /dev/null\n+++ b/db/migrations/0018_promo_codes.sql\n@@ -0,0 +1,20 @@\n+CREATE TABLE "promo_codes" (');
    // A line-range ref: only the selected part of the hunk, under its own header.
    expect(md).toContain("```diff\n--- /dev/null\n+++ b/src/lib/promo.ts\n@@ -0,0 +46,9 @@\n+/** A discount never exceeds the subtotal");
    expect(md).toContain('```mermaid\nflowchart TD\n  find["findPromo(code)"]');
    expect(md).toContain(`[\`checkPromo\`](https://github.com/acme/storefront/blob/${DEMO_SHAS.pr128v2}/src/lib/promo.ts#L`);
    expect(md).toContain("--- a/src/components/cart/Summary.tsx\n+++ b/src/components/checkout/OrderSummary.tsx");
    expect(md).toContain("## 6. Other changes");
    expect(md).toContain('## Coverage\n\nSections cover all 413 changed lines, 16 of them only in the automatic "Other changes" section.');
    expect(md).not.toMatch(/\]\(diff:/);
    await showText(page, "acme-storefront-pr128-v2.md", md);
    await caption(page, "The .md file: metadata, contents, each section's explanation and its diff, and a coverage note", "Markdown");
    await shot(page, "export-markdown-file");
    await pause(page, 1200);
    await page.mouse.wheel(0, 2600);
    await pause(page, 1200);

    // PDF (print): opens the print layout in a new tab, which opens the print dialog once diagrams are drawn.
    await page.goto(demoPaths.pull(DEMO_PRS.main));
    await page.locator("summary").filter({ hasText: "Export" }).click();
    const printItem = page.getByRole("menuitem", { name: "PDF (print)" });
    await expect(printItem).toHaveAttribute("href", `${PRINT}?v=2&autoprint=1`);
    await expect(printItem).toHaveAttribute("target", "_blank");
    await caption(page, "PDF (print) opens the print layout in a new tab, and the print dialog once diagrams are drawn", "PDF");
    await pause(page);
    const [popup] = await Promise.all([context.waitForEvent("page"), printItem.click()]);
    await expect(popup.locator('[data-print-ready="true"]')).toBeAttached({ timeout: 60_000 });
    await expect.poll(() => popup.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
    await popup.close();

    // The print layout, without the app header.
    await page.goto(`${PRINT}?v=2`);
    await expect(page.getByLabel("Home")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Apply promo codes at checkout" })).toBeVisible();
    await expect(page.locator('[data-print-ready="true"]')).toBeAttached({ timeout: 60_000 });
    await expect(page.getByRole("status")).toHaveText("Ready to print");
    await caption(page, "The print layout: a cover with the pull request, the guide's metadata and the contents", "PDF");
    await shot(page, "export-print-cover");
    await pause(page, 1500);

    const sections = page.locator("section.print-page");
    await expect(sections).toHaveCount(7);
    const validation = page.getByRole("region", { name: "Section 2: Validating a code" });
    await expect(validation.locator("figure.md-mermaid .mermaid-light svg")).toBeVisible();
    const migration = page.getByRole("region", { name: "Section 1: Promo codes table" }).locator('.print-file[data-path="db/migrations/0018_promo_codes.sql"]');
    await expect(migration).toContainText('CREATE TABLE "promo_codes"');
    await expect(migration.locator("tr.row-add").first().locator("td.diff-num").nth(1)).toHaveText("1");

    await page.mouse.wheel(0, 900);
    await caption(page, "The summary, then a page per section", "PDF");
    await pause(page, 1200);
    await scrollToTop(page, 'section[aria-label="Section 2: Validating a code"]');
    await caption(page, "Explanation first, with Mermaid diagrams rendered", "PDF");
    await shot(page, "export-print-mermaid");
    await pause(page, 1500);
    await scrollToTop(page, 'section[aria-label="Section 2: Validating a code"] .print-file');
    await caption(page, "Then the diff it covers", "PDF");
    await pause(page, 1500);
    await scrollToTop(page, 'section[aria-label="Section 3: Discounts in cart totals"] .print-file[data-path="src/lib/cart.ts"]');
    await caption(page, "Highlighted in light colors, with line numbers on both sides", "PDF");
    await shot(page, "export-print-diff");
    await pause(page, 1500);
    await scrollToTop(page, 'section[aria-label="Section 3: Discounts in cart totals"] .print-file[data-path="src/lib/promo.ts"]');
    await caption(page, "Line-range refs print only the lines they select", "PDF");
    await pause(page, 1500);
    await scrollToTop(page, ".print-coverage");
    await caption(page, "It ends with a coverage note", "PDF");
    await pause(page, 1200);

    await page.evaluate(() => window.scrollTo(0, 0));
    await caption(page, "Print or save as PDF opens the browser's print dialog", "PDF");
    await page.getByRole("button", { name: "Print or save as PDF" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
    await pause(page);
    await caption(page);

    // A real PDF, as the print dialog saves it.
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(8);
    const file = saveMedia("acme-storefront-pr128-v2.pdf", pdf);
    if (file) {
      // The cover, the page of section 2 with its Mermaid diagram, and a page of diff.
      pdfPage(file, 1, "export-pdf-cover");
      const mermaid = pdfPageWith(file, pageCount, "section 02 / 06");
      if (mermaid) pdfPage(file, mermaid, "export-pdf-mermaid");
      const diff = pdfPageWith(file, pageCount, "src/lib/cart.ts");
      if (diff) pdfPage(file, diff, "export-pdf-diff");
    }

    // On paper the bar above the layout is left out.
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("the print layout fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PRINT}?v=1`);
    await expect(page.locator('[data-print-ready="true"]')).toBeAttached({ timeout: 60_000 });
    await expect(page.getByText("Guided PR · v1")).toBeVisible();
    // The guide is outdated: the cover says so.
    await expect(page.getByText(`The pull request now points to ${DEMO_SHAS.pr128v2.slice(0, 7)}.`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "export-print-mobile");
    await scrollToTop(page, 'section[aria-label="Section 1: Promo codes table"] .print-file');
    await shot(page, "export-print-mobile-diff");
  });

  test.describe("files and the API", () => {
    let sectionId = "";
    let originalBody = "";
    let assetId = "";

    test.beforeEach(async () => {
      const id = await guideId(DEMO_PRS.main, 2);
      const [section] = await sql()`select id, body from guide_sections where guide_id = ${id} order by position limit 1`;
      sectionId = section.id;
      originalBody = section.body;
      assetId = randomBytes(8).toString("hex");
      await sql()`
        insert into assets (id, workspace_id, guide_id, filename, content_type, size, storage)
        select ${assetId}, workspace_id, id, 'chart.png', 'image/png', ${PNG.length}, 'database' from guides where id = ${id}`;
      await sql()`insert into asset_blobs (asset_id, data) values (${assetId}, ${PNG})`;
      const extra = `\n\n![Chart](/api/assets/${assetId}/chart.png)\n\n[Spec](../docs/spec.md)\n\n$$\n\\text{discount} = \\min(a, s)\n$$`;
      await sql()`update guide_sections set body = ${originalBody + extra} where id = ${sectionId}`;
    });

    test.afterEach(async () => {
      await sql()`update guide_sections set body = ${originalBody} where id = ${sectionId}`;
      await sql()`delete from assets where id = ${assetId}`;
      await sql()`delete from api_tokens where name = ${TOKEN_NAME}`;
    });

    test("makes links absolute, keeps math and embeds images on request", async ({ page }) => {
      const id = await guideId(DEMO_PRS.main, 2);
      const plain = await page.request.get(`/api/guides/${id}/export?format=md`);
      expect(plain.status()).toBe(200);
      expect(plain.headers()["content-type"]).toBe("text/markdown; charset=utf-8");
      expect(plain.headers()["content-disposition"]).toBe('attachment; filename="acme-storefront-pr128-v2.md"');
      const text = await plain.text();
      expect(text).toContain(`![Chart](${E2E.appUrl}/api/assets/${assetId}/chart.png)`);
      expect(text).toContain(`[Spec](${E2E.appUrl}/w/demo/acme/storefront/docs/spec.md)`);
      expect(text).toContain("$$\n\\text{discount} = \\min(a, s)\n$$");

      const embedded = await (await page.request.get(`/api/guides/${id}/export?format=md&embed_images=1`)).text();
      expect(embedded).toContain(`![Chart](data:image/png;base64,${PNG.toString("base64")})`);
      expect(embedded).toContain(`[Spec](${E2E.appUrl}/w/demo/acme/storefront/docs/spec.md)`);

      expect((await page.request.get(`/api/guides/${id}/export?format=pdf`)).status()).toBe(400);
      // The REST API takes tokens, not the browser session.
      expect((await page.request.get(`/api/v1/guides?pr=${encodeURIComponent(`${DEMO_REPO.fullName}#${DEMO_PRS.main}`)}&format=md`)).status()).toBe(401);
      const anonymous = await playwrightRequest.newContext({ baseURL: E2E.appUrl, storageState: { cookies: [], origins: [] } });
      expect((await anonymous.get(`/api/guides/${id}/export?format=md`)).status()).toBe(401);
      await anonymous.dispose();
    });

    test("the REST API returns the same Markdown", async () => {
      const token = await ownerToken();
      const api = await playwrightRequest.newContext({ baseURL: E2E.appUrl, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
      const pr = encodeURIComponent(`${DEMO_REPO.fullName}#${DEMO_PRS.main}`);

      const v1 = await api.get(`/api/v1/guides?pr=${pr}&version=1&format=md`);
      expect(v1.status()).toBe(200);
      expect(v1.headers()["content-disposition"]).toBe('attachment; filename="acme-storefront-pr128-v1.md"');
      const md = await v1.text();
      expect(md).toContain("- **Guide:** version 1, ready");
      expect(md).toContain(`The pull request now points to [\`${DEMO_SHAS.pr128v2.slice(0, 7)}\`]`);
      expect(md).toContain("```diff\n");

      const latest = await (await api.get(`/api/v1/guides?pr=${pr}&format=md&embed_images=true`)).text();
      expect(latest).toContain("- **Guide:** version 2, ready");
      expect(latest).toContain(`![Chart](data:image/png;base64,`);

      // JSON stays the default.
      expect((await (await api.get(`/api/v1/guides?pr=${pr}`)).json()).version).toBe(2);
      expect((await api.get(`/api/v1/guides?pr=${pr}&format=html`)).status()).toBe(400);
      expect((await api.get(`/api/v1/guides?pr=${pr}&format=md&embed_images=maybe`)).status()).toBe(400);
      await api.dispose();
    });
  });
});
