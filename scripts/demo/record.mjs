// Records the Guided PRs product walkthrough.
//
//   node scripts/demo/record.mjs
//
// Env: BASE_URL (default http://localhost:3000), GITHUB_TOKEN (used for token sign-in),
//      DEMO_REPO (owner/name), DEMO_PR (number), GUIDE_FILE (JSON written for the agent step),
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
import { CURSOR_AND_CAPTIONS, makeDemo } from "./helpers.mjs";
import { Recorder } from "./recorder.mjs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const REPO = process.env.DEMO_REPO ?? "tom-byrn/Guided-PRs";
const PR = Number(process.env.DEMO_PR ?? 1);
const PR_URL = `https://github.com/${REPO}/pull/${PR}`;
const GUIDE = JSON.parse(readFileSync(process.env.GUIDE_FILE ?? "scripts/demo/hearth-guide.json", "utf8"));
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
        <h1 style="font-weight:400;font-size:32px;letter-spacing:-.03em;margin:20px 0 8px">Connected to Guided PRs.</h1>
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
async function runAgent(client, { pause, beforeWrite }) {
  await call(client, "whoami", {});
  const info = await call(client, "get_pull_request", { pr: PR_URL });
  const headSha = /head_sha: (\w+)/.exec(info)[1];
  await call(client, "get_diff", { pr: PR_URL, max_chars: 200000 });
  const uploads = {};
  for (const file of GUIDE.media ?? []) {
    const data = readFileSync(path.join(MEDIA_DIR, file)).toString("base64");
    const out = await call(client, "upload_asset", { filename: file, content_base64: data });
    uploads[file] = /URL: (\S+)/.exec(out)[1];
  }
  const fill = (s) => s.replace(/\{\{media:([^}]+)\}\}/g, (_, f) => uploads[f] ?? f);
  await beforeWrite?.();
  const started = await call(client, "start_guide", { pr: PR_URL, head_sha: headSha, title: GUIDE.title, summary: fill(GUIDE.summary) });
  const guideId = /guide_id: (\S+)/.exec(started)[1];
  for (const s of GUIDE.sections) {
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
await context.addInitScript(CURSOR_AND_CAPTIONS);
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
    path.join(OUT_DIR, "guided-prs-demo.mp4"),
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

rec = new Recorder(path.join(OUT_DIR, "raw.mp4"), { width: Math.round(W * SCALE), height: Math.round(H * SCALE) });

// 1. Landing page
await mark("landing");
await goto("/");
await rec.use(page);
await d.sleep(1200);
await d.caption("Guided PRs", "Open-source, self-hosted guided walkthroughs for pull requests.");
await d.sleep(3500);
await d.scroll(860, { duration: 2200 });
await d.caption("Guided PRs", "Sections in review order. Explanation on the left, the code it covers on the right.");
await d.sleep(3000);
await d.scroll(820, { duration: 1800 });
await d.sleep(1500);
await d.scroll(900, { duration: 1800 });
await d.caption("How it works", "Connect GitHub, let an agent write the guide, review in sections, comment on GitHub.");
await d.sleep(6500);
await d.scroll(1000, { duration: 2000 });
await d.caption("Features", "Markdown with Mermaid, tables and video. Expandable context. Workspaces and invites.");
await d.sleep(3500);
await d.scroll(1000, { duration: 2000 });
await d.caption("Agents", "One prompt sets up the MCP server in Claude Code, Codex, Cursor or VS Code.");
await d.sleep(1200);
await d.click(page.locator("#agents").getByRole("button", { name: "Copy" }).first());
await d.sleep(2200);
await d.scroll(900, { duration: 1800 });
await d.caption("Self-host", "One container and Postgres. MIT licensed.");
await d.sleep(3000);
await d.scroll("top", { duration: 2200 });
await d.caption(null, null);
await d.sleep(600);

// 2. Sign in
await mark("sign in");
await d.click(page.getByRole("link", { name: /^Sign in/ }).first());
await page.waitForURL(/\/login/);
await d.sleep(1200);
await d.caption("Sign in", "Sign in with GitHub. This instance has no OAuth app, so it uses a GitHub token instead.");
await d.sleep(2500);
await d.click(page.getByText("Sign in with a GitHub token"));
await d.type(page.locator("#token"), process.env.GITHUB_TOKEN, { delay: 4 });
await d.sleep(400);
await d.click(page.getByRole("button", { name: "Sign in with token" }));
await page.waitForURL(/\/w\//);
await d.sleep(1500);

// 3. Connect GitHub and add the repository
await mark("connect");
await d.caption("Workspace", "A personal workspace is created on first sign-in. Connect GitHub to see pull requests.");
await d.sleep(3000);
await d.click(page.getByRole("link", { name: "Connect GitHub" }));
await page.waitForURL(/settings\/github/);
await d.sleep(1200);
await d.caption("GitHub", "Install the GitHub App on an organization, use your own account, or add a token.");
await d.scroll(520, { duration: 1400 });
await d.sleep(1500);
await d.click(page.getByRole("button", { name: /Connect @/ }));
await d.sleep(1800);
await d.scroll("top", { duration: 1000 });
await d.sleep(1500);
await d.click(page.getByRole("link", { name: "Repositories" }));
await page.waitForURL(/\/repos/);
await d.sleep(1500);
await d.caption("Repositories", "Choose the repositories this workspace follows.");
await d.type(page.locator("#manual"), REPO, { delay: 45 });
await d.click(page.getByRole("button", { name: "Add", exact: true }).first());
await page.getByText(`Added ${REPO}`).waitFor();
await d.sleep(2200);

// 4. Pull requests dashboard
await mark("dashboard");
await d.click(page.getByRole("link", { name: "Pull requests" }));
await page.waitForURL(new RegExp(`/w/[^/]+$`));
await d.sleep(1500);
await d.caption("Pull requests", "Open, merged and closed pull requests, grouped by repository. Data comes from GitHub.");
await d.sleep(3200);
const tabs = page.getByRole("navigation", { name: "Filter by state" });
await d.click(tabs.getByRole("link", { name: /^Closed/ }));
await page.waitForURL(/state=closed/);
await d.sleep(1600);
await d.click(tabs.getByRole("link", { name: /^All/ }));
await page.waitForURL(/state=all/);
await d.sleep(1800);
await d.click(tabs.getByRole("link", { name: /^Open/ }));
await page.waitForURL((u) => !u.search.includes("state="));
await d.sleep(1200);
const row = page.locator("li").filter({ has: page.getByText(`#${PR}`, { exact: true }) }).first();
await d.hover(row.getByRole("button", { name: "Copy prompt" }));
await d.caption("Agent prompt", `"Create a guided PR for <link> using the Guided PRs MCP."`);
await d.sleep(800);
await d.click(row.getByRole("button", { name: "Copy prompt" }));
await d.sleep(2200);

// 5. PR without a guide
await mark("no guide");
await d.click(row.getByRole("link").first());
await page.waitForURL(/\/pull\//);
await d.sleep(1500);
await d.caption("No guide yet", "Use your agent, the built-in AI provider, or write the guide yourself.");
await d.sleep(4000);

// 6. Agent connects over OAuth and writes the guide
await mark("agent oauth");
const oauth = await oauthBegin();
const prPage = page.url();
await d.caption("Agent", "The agent adds the MCP server and opens the consent screen.");
await goto(oauth.authorizeUrl);
await d.sleep(2500);
await d.click(page.getByRole("button", { name: "Allow" }));
await page.waitForURL(/127\.0\.0\.1:53682/);
await d.sleep(2000);
const client = await oauth.finish();
await goto(prPage);
await d.caption("Agent", "Claude Code reads the diff over MCP and writes the guide. Sections appear as they are added.");
rec.pause();
let resumed;
const writing = new Promise((r) => (resumed = r));
const agentRun = runAgent(client, {
  pause: () => new Promise((r) => setTimeout(r, 2600)),
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
await client.close();
await page.reload({ waitUntil: "networkidle" });
await d.sleep(1500);

// 7. Overview
const LEFT = ".grain.overflow-y-auto";
const RIGHT = ".bg-wash.overflow-y-auto";
const tab = (n) => page.locator('nav[aria-label="Guide sections"] button').nth(n);
const markReviewed = () => d.click(page.getByRole("button", { name: /Mark reviewed and continue/ }));

await mark("overview");
await d.caption("Overview", "The summary, with a diagram and tables, next to every changed file and the section that covers it.");
await d.sleep(3000);
await d.scroll(760, { container: LEFT, duration: 2400 });
await d.sleep(2600);
await d.scroll(820, { container: LEFT, duration: 2200 });
await d.sleep(2200);
await d.scroll(700, { container: RIGHT, duration: 2000 });
await d.sleep(2200);

// 8. Sections
async function openSection(n, text) {
  await mark(`section ${n}`);
  await d.click(tab(n));
  await d.sleep(1200);
  if (text) await d.caption(`Section ${String(n).padStart(2, "0")}`, text);
}

await openSection(1, "Each section explains one part of the change, next to the code it covers.");
await d.sleep(3200);
await d.scroll(560, { container: LEFT, duration: 2200 });
await d.sleep(3000);
await d.scroll(640, { container: LEFT, duration: 2000 });
await d.sleep(1200);
await d.caption("Code links", "Links in the explanation jump to the lines they describe.");
await d.click(page.locator(`${LEFT} .code-ref`, { hasText: "idx_offers_one_open" }));
await d.sleep(3200);
const migrateFile = page.locator('[data-path="server/db/migrate.ts"]');
await d.scrollTo(RIGHT, migrateFile, { duration: 1600 });
await d.caption("Context", "Unchanged lines stay folded. Expand 20 at a time, to the enclosing block, or the whole file.");
await d.sleep(1800);
await d.click(migrateFile.getByRole("button", { name: /Enclosing block/ }).first());
await d.sleep(3200);
await markReviewed();
await d.sleep(2600);

await openSection(3, "Explanations are GitHub-flavored markdown: tables, math, Mermaid diagrams, alerts.");
await d.sleep(3000);
await d.scroll(620, { container: LEFT, duration: 2200 });
await d.sleep(3000);
await d.click(page.locator(`${LEFT} .code-ref`, { hasText: "pmiRate" }));
await d.sleep(3000);
await markReviewed();
await d.sleep(2200);

await openSection(5, null);
await d.sleep(1200);
await d.scroll(700, { container: LEFT, duration: 2200 });
await d.sleep(3200);

// SKIP_GITHUB_WRITES=1 leaves out the steps that post to the pull request (for trying out the script).
const WRITE = process.env.SKIP_GITHUB_WRITES !== "1";

await openSection(9, "Comment on any line, or shift-click to select a range.");
const savedRoute = page.locator('[data-path="server/src/routes/savedSearches.ts"]');
const limitLine = savedRoute.locator("tr.row-add", { hasText: "listSavedSearches(db, req.clientId).length" });
await d.scrollTo(RIGHT, limitLine, { offset: 260, duration: 1800 });
await d.sleep(800);
await d.hover(limitLine);
await d.sleep(500);
await d.click(limitLine.locator(".diff-add-comment"));
await d.type(savedRoute.locator("textarea"), GUIDE.lineComment, { delay: 24 });
await d.sleep(400);
if (WRITE) {
  await d.click(savedRoute.getByRole("button", { name: "Comment on GitHub" }));
  await page.getByText("Comment posted to GitHub").waitFor();
}
await d.caption("Comments", "The comment is posted to the pull request on GitHub, and replies from GitHub show up here.");
await d.sleep(4500);

await openSection(12, "Screenshots and recordings sit next to the code that produced them.");
await d.sleep(2500);
await d.scroll(640, { container: LEFT, duration: 2400 });
await d.sleep(2800);
await d.scroll(900, { container: LEFT, duration: 2400 });
await d.sleep(2400);

await openSection(13, null);
await d.sleep(1000);
const video = page.locator(`${LEFT} video`).first();
await d.scrollTo(LEFT, video, { offset: 140, duration: 1200 });
await d.click(video);
await page.evaluate((sel) => document.querySelector(`${sel} video`)?.play(), LEFT);
await d.sleep(14000);
await page.evaluate((sel) => document.querySelector(`${sel} video`)?.pause(), LEFT);
await markReviewed();
await d.sleep(1500);

// 9. All files view
await mark("all files");
await d.click(page.getByRole("button", { name: "All files" }));
await d.caption("All files", "The full diff without the guide, loaded file by file.");
await d.sleep(2500);
await d.scroll(1600, { container: ".bg-wash.overflow-y-auto", duration: 2600 });
await d.sleep(1200);
await d.click(page.getByRole("button", { name: "All files" }));
await d.sleep(800);

// 10. Finish review
await mark("finish review");
await d.click(page.locator('nav[aria-label="Guide sections"] button', { hasText: "Finish review" }));
await d.caption("Finish", "Submit a review to GitHub: approve, request changes or comment.");
await d.sleep(2200);
await d.type(page.locator("#review-body"), GUIDE.reviewComment, { delay: 18 });
if (WRITE) {
  await d.click(page.getByRole("button", { name: "Comment", exact: true }));
  await page.getByText(/posted to GitHub/).waitFor();
}
await d.sleep(3000);

// 11. Invite a teammate
await mark("invite");
await d.click(page.getByRole("link", { name: "Settings" }));
await d.sleep(1200);
await d.click(page.getByRole("link", { name: "Members" }));
await d.caption("Members", "Invite teammates with a link. Everyone sees the same repositories and guides.");
await d.sleep(1500);
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
await ctx2.addInitScript(CURSOR_AND_CAPTIONS);
const page2 = await ctx2.newPage();
page2.setDefaultTimeout(60_000);
const d2 = makeDemo(page2);
rec.pause();
await page2.goto(inviteUrl, { waitUntil: "networkidle" });
await rec.use(page2);
rec.resume();
await d2.caption("Teammate", "Alex opens the invite link in their own browser.");
await d2.sleep(2500);
await d2.click(page2.getByRole("link", { name: "Create account" }));
await d2.type(page2.locator("#name"), "Alex Rivera", { delay: 30 });
await d2.type(page2.locator("#email"), "alex@example.com", { delay: 25 });
await d2.type(page2.locator("#password"), "correct-horse-battery", { delay: 15 });
await d2.click(page2.getByRole("button", { name: "Create account" }));
await page2.waitForURL(/\/w\//);
await d2.sleep(1500);
await d2.caption("Teammate", "Alex sees the same pull requests and guides.");
await d2.sleep(2500);
await d2.click(page2.getByRole("link", { name: "Open guide" }).first());
await page2.waitForURL(/\/pull\//);
await d2.sleep(2200);
await d2.click(page2.locator('nav[aria-label="Guide sections"] button').nth(GUIDE.teammateSection ?? 1));
await d2.caption("Teammate", "Review progress and comments are shared.");
await d2.sleep(3000);
rec.pause();
await rec.use(page);
await page.reload({ waitUntil: "networkidle" });
rec.resume();
await ctx2.close();

// 12. Settings tour
await mark("settings");
await d.caption("Settings", "AI provider for built-in generation: OpenRouter, Anthropic, OpenAI or a local model.");
await d.click(page.getByRole("link", { name: "AI provider" }));
await d.sleep(2200);
await d.click(page.locator("#provider"));
await d.sleep(1200);
await page.keyboard.press("Escape");
await d.sleep(800);
await d.click(page.getByRole("link", { name: "Automation" }));
await d.caption("Automation", "Create a guide for every new pull request and a new version on every push.");
await d.sleep(3200);
await d.click(page.getByRole("link", { name: "API tokens & MCP" }));
await d.caption("Agents", "MCP server URL, client setup and API tokens. OAuth clients appear here too.");
await d.sleep(2000);
for (const tab of ["Codex", "Cursor", "VS Code", "Claude Code"]) {
  await d.click(page.getByRole("button", { name: tab, exact: true }));
  await d.sleep(700);
}
await d.scroll(700, { duration: 1600 });
await d.sleep(2200);
await d.click(page.getByRole("link", { name: "Activity" }));
await d.caption("Activity", "Every guide, comment, review and membership change in the workspace.");
await d.sleep(3500);

// 13. Editor
await mark("editor");
await goto(prPage);
await d.sleep(1200);
await d.click(page.getByRole("link", { name: "Edit", exact: true }));
await d.caption("Editor", "Guides can also be written or adjusted by hand: sections, diff references, images and video.");
await d.sleep(2500);
await d.scroll(900, { duration: 2200 });
await d.sleep(1800);

// 14. Instance settings
await mark("admin");
await goto("/admin");
await d.caption("Self-hosting", "Instance settings create the GitHub App in one step and show webhooks and background jobs.");
await d.sleep(3500);
await d.scroll(700, { duration: 1800 });
await d.sleep(1500);

// End on the guide overview
await mark("end");
await goto(prPage);
await d.caption("Guided PRs", "github.com/tom-byrn/guided-prs");
await d.sleep(3500);
await d.caption(null, null);
await d.sleep(800);

await finish();
