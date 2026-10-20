/**
 * Direct database access for the harness and for specs that need to prepare or check rows.
 * Specs run in separate worker processes; each gets its own small connection pool.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { DEMO_USERS, type DemoUserKey } from "../scripts/demo-data";
import { E2E } from "./config";

let client: postgres.Sql | null = null;

/** Tagged-template SQL client for the e2e database (postgres.js). */
export function sql(): postgres.Sql {
  client ??= postgres(E2E.databaseUrl, { max: 2, onnotice: () => {} });
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = null;
}

/** Create the database in `url` if it does not exist (connects to the `postgres` database to do it). */
export async function ensureDatabase(url: string = E2E.databaseUrl): Promise<boolean> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[\w-]+$/.test(name)) throw new Error(`Unexpected database name in ${url}`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const db = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await db`select 1 from pg_database where datname = ${name}`;
    if (rows.length > 0) return false;
    await db.unsafe(`create database "${name}"`);
    return true;
  } finally {
    await db.end();
  }
}

/** Create a session for a demo user and return the raw cookie value (what the app stores as sha256). */
export async function createSession(user: DemoUserKey): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const id = createHash("sha256").update(token).digest("hex");
  const rows = await sql()`
    insert into sessions (id, user_id, expires_at, user_agent)
    select ${id}, id, now() + interval '30 days', 'Playwright'
    from users where lower(email) = ${DEMO_USERS[user].email}
    returning id`;
  if (rows.length === 0) throw new Error(`Demo user ${DEMO_USERS[user].email} not found. Was the database seeded?`);
  return token;
}

/** ID of a guide version of a demo pull request. */
export async function guideId(prNumber: number, version: number): Promise<string> {
  const [row] = await sql()`
    select g.id from guides g join workspaces w on w.id = g.workspace_id
    where w.slug = 'demo' and g.pr_number = ${prNumber} and g.version = ${version}`;
  if (!row) throw new Error(`No guide v${version} for #${prNumber}`);
  return row.id as string;
}

/** Remove a demo user's review marks on a guide version, so a spec starts from a known state. */
export async function clearReviewMarks(user: DemoUserKey, prNumber: number, version: number): Promise<void> {
  const id = await guideId(prNumber, version);
  await sql()`
    delete from section_reviews
    where guide_id = ${id} and user_id = (select id from users where lower(email) = ${DEMO_USERS[user].email})`;
}
