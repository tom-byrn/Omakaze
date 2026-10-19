/**
 * Creates the e2e database if it does not exist. Runs before the app starts (the app applies
 * migrations on start, which needs the database). The global setup then migrates and seeds it.
 */
import { E2E } from "./config";
import { ensureDatabase } from "./db";

const created = await ensureDatabase(E2E.databaseUrl);
const name = new URL(E2E.databaseUrl).pathname.slice(1);
console.log(created ? `[e2e] created database ${name}` : `[e2e] using database ${name}`);
