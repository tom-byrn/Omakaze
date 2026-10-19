/**
 * Runs the app the way the end-to-end tests do: the e2e database (created, migrated and seeded),
 * the mock GitHub API and `next dev` on E2E_PORT. Use it to browse the demo by hand, take
 * screenshots, or rerun specs quickly: `pnpm test:e2e` reuses this server.
 *
 *   pnpm e2e:serve                  # http://localhost:3100, Ctrl-C stops everything
 *   E2E_PORT=3110 pnpm e2e:serve    # an isolated copy (database omakaze_e2e_3110, mock on 3209)
 *   E2E_SERVER=start pnpm e2e:serve # `next start` (run `pnpm build` first)
 */
import { spawn } from "node:child_process";
import { DEMO_PASSWORD, DEMO_PRS, DEMO_USERS, demoPaths } from "../scripts/demo-data";
import { appEnv, E2E, ROOT } from "./config";
import { closeDb, ensureDatabase } from "./db";
import { ensureMockGitHub, ensureMockNotify, seedDatabase, warmUp, writeStorageStates } from "./setup";

process.env.DEMO_NOW ??= String(Date.now());

async function waitForHealth(timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${E2E.appUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${E2E.appUrl} did not become healthy`);
}

await ensureDatabase(E2E.databaseUrl);
if (E2E.seed) seedDatabase();
const mock = await ensureMockGitHub();
const notify = await ensureMockNotify();

const args = E2E.server === "start" ? ["exec", "next", "start", "--port", String(E2E.port)] : ["exec", "next", "dev", "--port", String(E2E.port)];
const app = spawn("pnpm", args, { cwd: ROOT, env: { ...process.env, ...appEnv() }, stdio: "inherit" });

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  app.kill("SIGTERM");
  await mock?.close();
  await notify?.close();
  await closeDb();
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
app.on("exit", (code) => void stop(code ?? 0));

await waitForHealth(240_000);
await writeStorageStates();
if (E2E.server === "dev") await warmUp();
await closeDb();

console.log(`
[e2e] ready on ${E2E.appUrl} (database ${new URL(E2E.databaseUrl).pathname.slice(1)}, mock GitHub ${E2E.github === "mock" ? `on port ${E2E.githubPort}` : "off"})

  Sign in:    ${E2E.appUrl}${demoPaths.login}  ${DEMO_USERS.owner.email} / ${DEMO_PASSWORD}
              (also ${DEMO_USERS.admin.email} and ${DEMO_USERS.member.email})
  Dashboard:  ${E2E.appUrl}${demoPaths.dashboard}
  Guide:      ${E2E.appUrl}${demoPaths.pull(DEMO_PRS.main)}
  Version 1:  ${E2E.appUrl}${demoPaths.pull(DEMO_PRS.main, { v: 1 })}

  Run specs against this server: pnpm test:e2e (it re-seeds; E2E_SEED=0 keeps the data)
`);
