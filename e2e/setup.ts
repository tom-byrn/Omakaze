/**
 * Preparing a run: database, seed, mock GitHub API, signed-in sessions and route warm-up.
 * Shared by the Playwright global setup and `pnpm e2e:serve`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEMO_PRS, DEMO_USERS, demoPaths, type DemoUserKey } from "../scripts/demo-data";
import { appEnv, E2E, ROOT } from "./config";
import { closeDb, createSession, ensureDatabase, guideId } from "./db";
import { mockGitHub, startMockGitHub, type MockServer } from "./mock-github";

export const USER_KEYS = Object.keys(DEMO_USERS) as DemoUserKey[];

const log = (message: string) => console.log(`[e2e] ${message}`);

/** Create the database if needed, apply migrations and seed the demo data (scripts/seed-demo.ts). */
export function seedDatabase(): void {
  const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
  const started = Date.now();
  const result = spawnSync(tsx, ["scripts/seed-demo.ts", `--github=${E2E.github}`], {
    cwd: ROOT,
    env: { ...process.env, ...appEnv() },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw new Error(`Seeding ${E2E.databaseUrl} failed`);
  }
  log(`seeded the demo data in ${((Date.now() - started) / 1000).toFixed(1)}s (GitHub: ${E2E.github})`);
}

/** Start the mock GitHub API, or reset the one that is already listening on the port. */
export async function ensureMockGitHub(): Promise<MockServer | null> {
  const now = Number(appEnv().DEMO_NOW);
  if (await mockGitHub.isRunning()) {
    await mockGitHub.reset(now);
    log(`reset the mock GitHub API on ${mockGitHub.url}`);
    return null;
  }
  const server = await startMockGitHub({ port: E2E.githubPort, now });
  log(`mock GitHub API on ${server.url}`);
  return server;
}

export function storageStatePath(user: DemoUserKey): string {
  return path.join(E2E.authDir, `${user}.json`);
}

/** Sign every demo user in (sessions straight in the database) and save Playwright storage states. */
export async function writeStorageStates(): Promise<void> {
  mkdirSync(E2E.authDir, { recursive: true });
  for (const user of USER_KEYS) {
    const token = await createSession(user);
    const state = {
      cookies: [
        { name: "omk_session", value: token, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const },
      ],
      origins: [],
    };
    writeFileSync(storageStatePath(user), JSON.stringify(state, null, 2));
  }
}

export function readStorageState(user: DemoUserKey): { cookies: { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: "Lax" }[] } {
  return JSON.parse(readFileSync(storageStatePath(user), "utf8"));
}

/**
 * Request the main pages once so `next dev` compiles them before the first test (the first
 * compile of a route can take longer than a test's timeout on a busy machine).
 */
export async function warmUp(): Promise<void> {
  const started = Date.now();
  const cookie = `omk_session=${readStorageState("owner").cookies[0].value}`;
  const v2 = await guideId(DEMO_PRS.main, 2);
  const paths = [
    demoPaths.login,
    demoPaths.dashboard,
    demoPaths.pull(DEMO_PRS.main),
    `/api/guides/${v2}/file?path=${encodeURIComponent("src/lib/promo.ts")}`,
    `/api/guides/${v2}/comments`,
    `/api/guides/${v2}/threads`,
    "/api/github/webhook",
    `/api/w/demo/latest-guide?number=${DEMO_PRS.main}`,
    demoPaths.pull(DEMO_PRS.noGuide),
    demoPaths.edit(DEMO_PRS.main),
    demoPaths.repo,
    demoPaths.repos,
    demoPaths.activity,
    demoPaths.settings,
    demoPaths.account,
    // More routes for a feature, e.g. E2E_WARMUP_PATHS=/w/demo/insights,/api/w/demo/export
    ...(process.env.E2E_WARMUP_PATHS ?? "").split(",").map((p) => p.trim()).filter(Boolean),
  ];
  for (const p of paths) {
    const res = await fetch(`${E2E.appUrl}${p}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
    if (res.status >= 500) log(`warm-up: ${p} answered ${res.status}`);
  }
  log(`warmed up ${paths.length} routes in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** Everything a run needs. Returns a function that stops what was started. */
export async function prepareRun(opts: { warmUp: boolean }): Promise<() => Promise<void>> {
  await ensureDatabase(E2E.databaseUrl);
  if (E2E.seed) seedDatabase();
  const mock = await ensureMockGitHub();
  await writeStorageStates();
  if (opts.warmUp) await warmUp();
  await closeDb();
  return async () => {
    await mock?.close();
  };
}
