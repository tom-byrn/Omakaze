import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

const globalForDb = globalThis as unknown as { __guidedPrsDb?: Db };

function create(): Db {
  const client = postgres(env().DATABASE_URL, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    onnotice: () => {},
  });
  return drizzle(client, { schema }) as Db;
}

/** Lazily-created database client (shared across hot reloads in development). */
export function getDb(): Db {
  if (!globalForDb.__guidedPrsDb) globalForDb.__guidedPrsDb = create();
  return globalForDb.__guidedPrsDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
