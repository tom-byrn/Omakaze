import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './connection';

export const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

const MIGRATION_FILE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  file: string;
}

/** Lists the migration files in `dir`, ordered by version. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = MIGRATION_FILE.exec(file);
      if (!match) {
        throw new Error(`Migration "${file}" must be named NNN_description.sql`);
      }
      return { version: Number(match[1]), name: match[2], file: join(dir, file) };
    })
    .sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i += 1) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(`Duplicate migration version ${migrations[i].version}`);
    }
  }
  return migrations;
}

/**
 * Applies every migration that hasn't been recorded in `schema_migrations` yet.
 * Each migration runs in its own transaction so a failure leaves the database
 * at the last good version.
 *
 * @returns the migrations that were applied by this call.
 */
export function migrate(db: Database, dir: string = MIGRATIONS_DIR): Migration[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row.version)),
  );

  const pending = loadMigrations(dir).filter((migration) => !applied.has(migration.version));
  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

  for (const migration of pending) {
    const sql = readFileSync(migration.file, 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      record.run(migration.version, migration.name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version}_${migration.name} failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  return pending;
}
