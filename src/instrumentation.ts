export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { landingOnly } = await import("./lib/landing-only");
  if (landingOnly) return;
  if (process.env.RUN_MIGRATIONS_ON_START !== "false") {
    const { runMigrations } = await import("./db/migrate");
    try {
      await runMigrations();
    } catch (err) {
      console.error("[startup] migrations failed", err);
      throw err;
    }
  }
  const { env } = await import("./lib/env");
  if (env().WORKER_ENABLED) {
    const { startWorker } = await import("./lib/jobs/worker");
    startWorker();
  }
}
