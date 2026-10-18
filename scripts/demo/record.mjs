// Records the Omakaze product walkthrough.
//
//   node scripts/demo/record.mjs
//
// Env: BASE_URL (default http://localhost:3000), GITHUB_TOKEN (used for token sign-in),
//      DEMO_REPO (owner/name), DEMO_PR (number), GUIDE_FILE (JSON written for the agent step),
//      DEMO_SMALL_PR, SMALL_GUIDE_FILE (a second pull request guided off camera),
//      MEDIA_DIR (screenshots/videos the agent uploads), OUT_DIR.
//
// The "agent" in this recording is a script using the official MCP client SDK. It connects through
// the same OAuth flow as Claude Code or Cursor (dynamic registration + PKCE + consent screen) and
// calls the same tools. The guide content it submits was written for this pull request beforehand.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CURSOR, makeDemo } from "./helpers.mjs";
import { Recorder } from "./recorder.mjs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const REPO = process.env.DEMO_REPO ?? "tom-byrn/tester-renting-app";
const PR = Number(process.env.DEMO_PR ?? 1);
const PR_URL = `https://github.com/${REPO}/pull/${PR}`;
const GUIDE = JSON.parse(readFileSync(process.env.GUIDE_FILE ?? "scripts/demo/hearth-guide.json", "utf8"));
// A second, small pull request gets a guide off camera, so the dashboard shows more than one.
const SMALL_PR = Number(process.env.DEMO_SMALL_PR ?? 4);
const SMALL_GUIDE = JSON.parse(readFileSync(process.env.SMALL_GUIDE_FILE ?? "scripts/demo/hearth-shortcut-guide.json", "utf8"));
const MEDIA_DIR = process.env.MEDIA_DIR ?? "demo-media";
const OUT_DIR = process.env.OUT_DIR ?? "demo-output";
const W = 1440;
const H = 900;
const SCALE = 4 / 3; // 1920x1200 video
mkdirSync(OUT_DIR, { recursive: true });

/* ---------------------------------------------------------------- */
/* MCP agent                                                        */
/* ---------------------------------------------------------------- */

async function oauthBegin() {
  const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
  const port = 53682;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const reg = await (
    await fetch(asm.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
    })
  ).json();
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(8).toString("hex");
  const authorizeUrl = `${asm.authorization_endpoint}?${new URLSearchParams({
    response_type: "code",
    client_id: reg.client_id,
    redirect_uri: redirectUri,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    scope: "mcp",
    resource: `${BASE}/api/mcp`,
  })}`;
  let resolveCode;
  const codePromise = new Promise((r) => (resolveCode = r));
  const server = http
    .createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.pathname !== "/callback") return res.end();
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fcfcfc;font-family:Georgia,serif">
        <div style="border:1px solid rgba(0,0,0,.15);background:#fff;padding:40px 48px;max-width:460px">
        <p style="font:10px/15px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(0,0,0,.6);border:1px dashed rgba(0,0,0,.25);display:inline-block;padding:4px 8px;margin:0">Claude Code</p>
        <h1 style="font-weight:400;font-size:32px;letter-spacing:-.03em;margin:20px 0 8px">Connected to Omakaze.</h1>
        <p style="font:15px/1.5 system-ui,sans-serif;color:#727272;margin:0">You can close this tab and return to your terminal.</p></div></body></html>`,
      );
      if (u.searchParams.get("state") === state) resolveCode(u.searchParams.get("code"));
    })
    .listen(port, "127.0.0.1");
  return {
    authorizeUrl,
    async finish() {
      const code = await codePromise;
      server.close();
      const tok = await (
        await fetch(asm.token_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: reg.client_id, code_verifier: verifier }),
        })
      ).json();
      if (!tok.access_token) throw new Error(`token exchange failed: ${JSON.stringify(tok)}`);
      const client = new Client({ name: "Claude Code", version: "2.1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
      return client;
    },
  };
}

async function call(client, name, args) {
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  const text = r.content.map((c) => c.text).join("\n");
  if (r.isError) throw new Error(`${name}: ${text}`);
  console.log(`[agent] ${name}: ${text.split("\n")[0]}`);
  return text;
}

/** Upload media, then write the guide section by section (the page updates live). */
async function runAgent(client, { pause, beforeWrite, guide = GUIDE, prUrl = PR_URL }) {
  await call(client, "whoami", {});
  const info = await call(client, "get_pull_request", { pr: prUrl });
  const headSha = /head_sha: (\w+)/.exec(info)[1];
  await call(client, "get_diff", { pr: prUrl, max_chars: 200000 });
  const uploads = {};
  for (const file of guide.media ?? []) {
    const data = readFileSync(path.join(MEDIA_DIR, file)).toString("base64");
    const out = await call(client, "upload_asset", { filename: file, content_base64: data });
    uploads[file] = /URL: (\S+)/.exec(out)[1];
  }
  const fill = (s) => s.replace(/\{\{media:([^}]+)\}\}/g, (_, f) => uploads[f] ?? f);
  await beforeWrite?.();
  const started = await call(client, "start_guide", { pr: prUrl, head_sha: headSha, title: guide.title, summary: fill(guide.summary) });
  const guideId = /guide_id: (\S+)/.exec(started)[1];
  for (const s of guide.sections) {
    await pause();
    await call(client, "add_section", { guide_id: guideId, title: s.title, body: fill(s.body), refs: s.refs });
  }
  await pause();
  return call(client, "finish_guide", { guide_id: guideId });
}

/* ---------------------------------------------------------------- */
/* Walkthrough                                                      */
/* ---------------------------------------------------------------- */

const browser = await chromium.launch();
const newContext = () =>
  browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, permissions: ["clipboard-read", "clipboard-write"] });
const context = await newContext();
await context.addInitScript(CURSOR);
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const d = makeDemo(page);
const t0 = Date.now();
let rec = null;
async function finish() {
  await rec.stop();
  await browser.close();
  mark2(`recorded ${rec.seconds.toFixed(1)}s, encoding`);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-i", path.join(OUT_DIR, "raw.mp4"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    path.join(OUT_DIR, "omakaze-demo.mp4"),
  ]);
  mark2("done");
}
const mark2 = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
/** Logs progress; STOP_AT=<label> ends the recording at that point (for trying out parts of the script). */
async function mark(label) {
  mark2(label);
  if (process.env.STOP_AT === label) {
    await finish();
    process.exit(0);
  }
}

async function goto(url) {
  await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "networkidle" });
  await d.moveTo(d.mouse.x, d.mouse.y, 1);
}

/** Moves the cursor over each element in turn. */
async function hoverEach(locators, ms = 900) {
  for (const locator of locators) {
    await d.hover(locator);
    await d.sleep(ms);
  }
}

rec = new Recorder(path.join(OUT_DIR, "raw.mp4"), { width: Math.round(W * SCALE), height: Math.round(H * SCALE) });

// 1. Landing page, top to bottom
await mark("landing");
await goto("/");
await rec.use(page);
await d.sleep(1500);
await d.moveTo(560, 250);
await d.sleep(1800);
await d.hover(page.getByRole("button", { name: "Copy agent setup prompt" }));
await d.sleep(1200);
await d.scroll(520, { duration: 2600 });
await d.sleep(1500);
// The product schematic: tabs, explanation and code.
await d.moveTo(420, 300);
await d.sleep(900);
await d.moveTo(900, 420);
await d.sleep(1400);
await d.scroll(460, { duration: 2200 });
await d.sleep(1800);
await d.scroll(380, { duration: 1800 });
await d.sleep(2200);
await d.scroll(420, { duration: 1800 });
await d.sleep(2600);

await mark("how it works");
await d.scrollTo(null, page.locator("#how-it-works"), { offset: 64, duration: 2000 });
await d.sleep(1500);
const steps = page.locator("#how-it-works button");
for (let i = 0; i < 4; i++) {
  await d.click(steps.nth(i));
  await d.sleep(3200);
}

await mark("features");
await d.scrollTo(null, page.locator("#features"), { offset: 64, duration: 2000 });
await d.sleep(1200);
await hoverEach(
  ["Sections, not files.", "Markdown that does more.", "Context when you need it.", "Comments go to GitHub.", "Shared by the team.", "Automatic when you want it."].map(
    (title) => page.locator("#features").getByText(title, { exact: true }),
  ),
  1300,
);

await mark("agents");
await d.scrollTo(null, page.locator("#agents"), { offset: 64, duration: 2000 });
await d.sleep(1500);
await d.moveTo(300, 560);
await d.sleep(1200);
await d.click(page.locator("#agents").getByRole("button", { name: "Copy" }).first());
await d.sleep(1800);
await d.click(page.locator("#agents").getByRole("button", { name: "Copy" }).nth(1));
await d.sleep(1800);

await mark("self-host");
await d.scrollTo(null, page.locator("#self-host"), { offset: 64, duration: 2000 });
await d.sleep(1500);
await d.click(page.locator("#self-host").getByRole("button", { name: "Copy" }).first());
await d.sleep(1800);
await d.hover(page.locator("#self-host").getByRole("link", { name: "Self-hosting guide" }));
await d.sleep(1200);
await d.scroll(560, { duration: 2000 });
await d.sleep(2200);
await d.scroll(1400, { duration: 2600 });
await d.sleep(1200);
await hoverEach(
  [/^how it works$/i, /^agents and mcp$/i, /^docker compose$/i, /^mcp tools$/i, /^rest api$/i].map((name) => page.locator("footer").getByRole("link", { name })),
  700,
);
await d.sleep(800);
await d.click(page.locator("footer").getByRole("link", { name: /back to top/i }));
await d.sleep(2600);

// 2. Sign in
await mark("sign in");
await d.click(page.getByRole("link", { name: /^Sign in/ }).first());
await page.waitForURL(/\/login/);
await d.sleep(2000);
await d.click(page.getByText("Sign in with a GitHub token"));
await d.type(page.locator("#token"), process.env.GITHUB_TOKEN, { delay: 4 });
await d.sleep(400);
await d.click(page.getByRole("button", { name: "Sign in with token" }));
await page.waitForURL(/\/w\//);
await d.sleep(2200);

// 3. Connect GitHub and add the repository
await mark("connect");
await d.click(page.getByRole("link", { name: "Connect GitHub" }));
await page.waitForURL(/settings\/github/);
await d.sleep(1800);
await d.scroll(520, { duration: 1600 });
await d.sleep(1500);
await d.click(page.getByRole("button", { name: /Connect @/ }));
await d.sleep(2000);
await d.scroll("top", { duration: 1000 });
await d.sleep(1200);
await d.click(page.getByRole("link", { name: "Repositories" }));
await page.waitForURL(/\/repos/);
await d.sleep(1800);
await d.type(page.locator("#manual"), REPO, { delay: 45 });
await d.click(page.getByRole("button", { name: "Add", exact: true }).first());
await page.getByText(`Added ${REPO}`).waitFor();
await d.sleep(2400);

// 4. Pull requests dashboard
await mark("dashboard");
await d.click(page.getByRole("link", { name: "Pull requests" }));
await page.waitForURL(new RegExp(`/w/[^/]+$`));
await d.sleep(2500);
const tabs = page.getByRole("navigation", { name: "Filter by state" });
await d.click(tabs.getByRole("link", { name: /^Merged/ }));
await page.waitForURL(/state=merged/);
await d.sleep(1800);
await d.click(tabs.getByRole("link", { name: /^Closed/ }));
await page.waitForURL(/state=closed/);
await d.sleep(1800);
await d.click(tabs.getByRole("link", { name: /^All/ }));
await page.waitForURL(/state=all/);
await d.sleep(2200);
await d.click(tabs.getByRole("link", { name: /^Open/ }));
await page.waitForURL((u) => !u.search.includes("state="));
await d.sleep(1400);
const prRow = (n) => page.locator("li").filter({ has: page.getByText(`#${n}`, { exact: true }) }).first();
const row = prRow(PR);
await d.hover(row.getByRole("button", { name: "Copy prompt" }));
await d.sleep(800);
await d.click(row.getByRole("button", { name: "Copy prompt" }));
await d.sleep(1800);

// 5. PR without a guide
await mark("no guide");
await d.click(row.getByRole("link").first());
await page.waitForURL(/\/pull\//);
await d.sleep(4500);

// 6. Agent connects over OAuth and writes the guide
await mark("agent oauth");
const oauth = await oauthBegin();
const prPage = page.url();
await goto(oauth.authorizeUrl);
await d.sleep(3000);
await d.click(page.getByRole("button", { name: "Allow" }));
// The redirect lands on the agent's local callback page, which is not part of Omakaze.
rec.pause();
await page.waitForURL(/127\.0\.0\.1:53682/);
const client = await oauth.finish();
await goto(prPage);
await d.sleep(500);
let resumed;
const writing = new Promise((r) => (resumed = r));
const agentRun = runAgent(client, {
  pause: () => new Promise((r) => setTimeout(r, 1800)),
  beforeWrite: () => {
    rec.resume();
    resumed();
  },
});
await writing;
await page.locator("text=Writing this guide").waitFor({ timeout: 120_000 });
await mark("writing");
await agentRun;
await d.sleep(4500);
rec.pause();
await runAgent(client, { pause: async () => {}, guide: SMALL_GUIDE, prUrl: `https://github.com/${REPO}/pull/${SMALL_PR}` });
await client.close();
await page.reload({ waitUntil: "networkidle" });
rec.resume();
await d.sleep(1500);

// 7. Overview
const LEFT = ".grain.overflow-y-auto";
const RIGHT = ".bg-wash.overflow-y-auto";
const tab = (n) => page.locator('nav[aria-label="Guide sections"] button').nth(n);
const markReviewed = () => d.click(page.getByRole("button", { name: /Mark reviewed and continue/ }));

await mark("overview");
await d.sleep(3000);
await d.scroll(760, { container: LEFT, duration: 2600 });
await d.sleep(3000);
await d.scroll(820, { container: LEFT, duration: 2400 });
await d.sleep(2800);
await d.scroll(800, { container: LEFT, duration: 2200 });
await d.sleep(2200);
await d.scroll(700, { container: RIGHT, duration: 2000 });
await d.sleep(2200);
await d.scroll(900, { container: RIGHT, duration: 2000 });
await d.sleep(1800);

// 8. Sections
async function openSection(n) {
  await mark(`section ${n}`);
  await d.click(tab(n));
  await d.sleep(1400);
}

await openSection(1);
await d.sleep(3200);
await d.scroll(560, { container: LEFT, duration: 2200 });
await d.sleep(3000);
await d.scroll(640, { container: LEFT, duration: 2000 });
await d.sleep(1200);
await d.click(page.locator(`${LEFT} .code-ref`, { hasText: "idx_offers_one_open" }));
await d.sleep(3600);
await markReviewed();
await d.sleep(2600);

// Section 2 opens from "Mark reviewed and continue".
await d.scroll(600, { container: LEFT, duration: 2200 });
await d.sleep(2400);
await d.scroll(800, { container: RIGHT, duration: 2200 });
await d.sleep(2000);
await markReviewed();
await d.sleep(2400);

// Section 3: tables, math and the code they describe.
await d.sleep(2600);
await d.scroll(620, { container: LEFT, duration: 2200 });
await d.sleep(3000);
await d.click(page.locator(`${LEFT} .code-ref`, { hasText: "pmiRate" }));
await d.sleep(3000);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(2400);
await markReviewed();
await d.sleep(2200);

// Section 4.
await d.scroll(600, { container: LEFT, duration: 2200 });
await d.sleep(2600);
await markReviewed();
await d.sleep(2000);

await openSection(5);
await d.sleep(1200);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(3200);

await openSection(6);
const queryFile = page.locator('[data-path="server/src/lib/listingQuery.ts"]');
const enclosingGap = queryFile.locator("tr.diff-gap").filter({ has: page.getByRole("button", { name: /Enclosing block/ }) }).first();
const enclosing = enclosingGap.getByRole("button", { name: /Enclosing block/ });
await d.scrollTo(RIGHT, enclosingGap, { offset: 300, duration: 1800 });
await d.sleep(2600);
await d.click(enclosing);
await d.sleep(2200);
await d.scroll(-260, { container: RIGHT, duration: 1600 });
await d.sleep(3000);

await openSection(7);
await d.sleep(2400);
await d.scroll(600, { container: LEFT, duration: 2200 });
await d.sleep(2600);

await openSection(8);
await d.sleep(2400);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(2400);
await d.scroll(900, { container: RIGHT, duration: 2200 });
await d.sleep(2000);

// SKIP_GITHUB_WRITES=1 leaves out the steps that post to the pull request (for trying out the script).
const WRITE = process.env.SKIP_GITHUB_WRITES !== "1";

await openSection(9);
const savedRoute = page.locator('[data-path="server/src/routes/savedSearches.ts"]');
const duplicateLine = savedRoute.locator("tr.row-add", { hasText: "already saved this search" });
await d.scrollTo(RIGHT, duplicateLine, { offset: 260, duration: 1800 });
await d.sleep(800);
await d.hover(duplicateLine);
await d.sleep(500);
await d.click(duplicateLine.locator(".diff-add-comment"));
await d.type(savedRoute.locator("textarea").first(), GUIDE.lineComment, { delay: 24 });
await d.sleep(400);
if (WRITE) {
  await d.click(savedRoute.getByRole("button", { name: "Comment on GitHub" }).first());
  await page.getByText("Comment posted to GitHub").waitFor();
}
await d.sleep(4500);

await openSection(10);
await d.sleep(2200);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(2200);

await openSection(11);
await d.sleep(2500);
await d.scroll(700, { container: LEFT, duration: 2400 });
await d.sleep(3000);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(2200);

await openSection(12);
await d.sleep(2500);
await d.scroll(640, { container: LEFT, duration: 2400 });
await d.sleep(2800);
await d.scroll(900, { container: LEFT, duration: 2400 });
await d.sleep(2600);
await d.scroll(900, { container: LEFT, duration: 2400 });
await d.sleep(2400);

await openSection(13);
await d.sleep(1000);
const video = page.locator(`${LEFT} video`).first();
await d.scrollTo(LEFT, video, { offset: 140, duration: 1200 });
await d.click(video);
await page
  .evaluate((sel) => document.querySelector(`${sel} video`)?.play(), LEFT)
  .catch((err) => console.warn("video did not play:", err.message));
await d.sleep(20000);
await page.evaluate((sel) => document.querySelector(`${sel} video`)?.pause(), LEFT);
await d.scroll(900, { container: LEFT, duration: 2200 });
await d.sleep(2600);
await markReviewed();
await d.sleep(1500);

// Section 14 opens from "Mark reviewed and continue".
await d.sleep(1500);
await d.scroll(700, { container: LEFT, duration: 2400 });
await d.sleep(3000);
await markReviewed();
await d.sleep(2200);
await d.scroll(600, { container: LEFT, duration: 2000 });
await d.sleep(2000);

// 9. All files view
await mark("all files");
await d.click(page.getByRole("button", { name: "All files" }));
await d.sleep(2500);
await d.scroll(1600, { container: RIGHT, duration: 2600 });
await d.sleep(1200);
await d.scroll(2400, { container: RIGHT, duration: 3000 });
await d.sleep(1200);
await d.click(page.getByRole("button", { name: "All files" }));
await d.sleep(800);

// 10. Finish review
await mark("finish review");
await d.click(page.locator('nav[aria-label="Guide sections"] button', { hasText: "Finish review" }));
await d.sleep(2200);
await d.type(page.locator("#review-body"), GUIDE.reviewComment, { delay: 18 });
if (WRITE) {
  await d.click(page.getByRole("button", { name: "Comment", exact: true }));
  await page.getByText(/posted to GitHub/).waitFor();
}
await d.sleep(3000);

// 11. The second pull request
await mark("second pr");
const workspaceNav = page.getByRole("navigation", { name: "Workspace" });
await d.click(workspaceNav.getByRole("link", { name: "Pull requests", exact: true }));
await page.waitForURL(new RegExp(`/w/[^/]+$`));
await d.sleep(2500);
await d.click(prRow(SMALL_PR).getByRole("link").first());
await page.waitForURL(/\/pull\//);
await d.sleep(3500);
await d.scroll(500, { container: LEFT, duration: 2000 });
await d.sleep(1800);
await d.click(tab(1));
await d.sleep(3500);
await d.scroll(400, { container: LEFT, duration: 1800 });
await d.sleep(1800);
await markReviewed();
await d.sleep(3500);

// 12. Invite a teammate
await mark("invite");
const settingsNav = page.getByRole("navigation", { name: "Settings" });
await d.click(workspaceNav.getByRole("link", { name: "Settings", exact: true }));
await d.sleep(1500);
await d.click(settingsNav.getByRole("link", { name: "Members", exact: true }));
await d.sleep(1800);
await d.click(page.getByRole("button", { name: "Create invite link" }));
const inviteCode = page.locator("code", { hasText: "/invite/" }).first();
await inviteCode.waitFor();
const inviteUrl = (await inviteCode.textContent()).trim();
await d.sleep(2500);
await d.click(page.locator("button", { hasText: "Copy link" }).first());
await d.sleep(1200);

// Second person opens the link in another browser.
await mark("teammate");
const ctx2 = await newContext();
await ctx2.addInitScript(CURSOR);
const page2 = await ctx2.newPage();
page2.setDefaultTimeout(60_000);
const d2 = makeDemo(page2);
rec.pause();
await page2.goto(inviteUrl, { waitUntil: "networkidle" });
await rec.use(page2);
rec.resume();
await d2.sleep(2500);
await d2.click(page2.getByRole("link", { name: "Create account" }));
await d2.type(page2.locator("#name"), "Alex Rivera", { delay: 30 });
await d2.type(page2.locator("#email"), "alex@example.com", { delay: 25 });
await d2.type(page2.locator("#password"), "correct-horse-battery", { delay: 15 });
await d2.click(page2.getByRole("button", { name: "Create account" }));
await page2.waitForURL(/\/w\//);
await d2.sleep(3000);
const teammateRow = page2.locator("li").filter({ has: page2.getByText(`#${PR}`, { exact: true }) }).first();
await d2.click(teammateRow.getByRole("link", { name: "Open guide" }));
await page2.waitForURL(/\/pull\//);
await d2.sleep(2200);
await d2.click(page2.locator('nav[aria-label="Guide sections"] button').nth(9));
await d2.sleep(3500);
rec.pause();
await rec.use(page);
await page.reload({ waitUntil: "networkidle" });
rec.resume();
await ctx2.close();
await d.sleep(1200);

// 13. Settings tour
await mark("settings");
await d.click(settingsNav.getByRole("link", { name: "AI provider", exact: true }));
await d.sleep(2200);
await d.click(page.getByText("Anthropic", { exact: true }));
await d.sleep(1800);
await d.scroll(600, { duration: 1800 });
await d.sleep(2200);
await d.scroll("top", { duration: 1400 });
await d.sleep(600);
await d.click(page.getByText("Ollama", { exact: true }));
await d.sleep(2200);
await d.click(settingsNav.getByRole("link", { name: "Automation", exact: true }));
await d.sleep(3200);
await d.click(settingsNav.getByRole("link", { name: "API tokens & MCP", exact: true }));
await d.sleep(2000);
for (const name of ["Codex", "Cursor", "VS Code", "Claude Code"]) {
  await d.click(page.getByRole("button", { name, exact: true }));
  await d.sleep(900);
}
await d.scroll(700, { duration: 1600 });
await d.sleep(2200);
await d.click(workspaceNav.getByRole("link", { name: "Activity", exact: true }));
await d.sleep(3500);
await d.scroll(500, { duration: 1600 });
await d.sleep(1500);

// 14. Editor
await mark("editor");
await goto(prPage);
await d.sleep(1200);
await d.click(page.getByRole("link", { name: "Edit", exact: true }));
await d.sleep(2500);
await d.scroll(900, { duration: 2200 });
await d.sleep(1800);
await d.scroll(900, { duration: 2200 });
await d.sleep(1800);

// 15. Instance settings
await mark("admin");
await goto("/admin");
await d.sleep(3500);
await d.scroll(700, { duration: 1800 });
await d.sleep(2000);

// End on the guide overview
await mark("end");
await goto(prPage);
await d.sleep(4500);

await finish();
process.exit(0);
