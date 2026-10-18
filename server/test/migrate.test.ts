import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection';
import { loadMigrations, migrate } from '../db/migrate';

const tempDirs: string[] = [];

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearth-migrations-'));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies the bundled migrations exactly once', () => {
    const db = openDatabase(':memory:');
    const first = migrate(db);
    expect(first.map((m) => m.version)).toEqual(loadMigrations().map((m) => m.version));
    expect(migrate(db)).toEqual([]);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(['favorites', 'inquiries', 'listings', 'neighborhoods']));
  });

  it('applies migrations in version order and records them', () => {
    const dir = migrationsDir({
      '002_add_color.sql': 'ALTER TABLE widgets ADD COLUMN color TEXT;',
      '001_widgets.sql': 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);',
    });
    const db = openDatabase(':memory:');
    expect(migrate(db, dir).map((m) => m.name)).toEqual(['widgets', 'add_color']);
    expect(db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()).toEqual([
      { version: 1, name: 'widgets' },
      { version: 2, name: 'add_color' },
    ]);
  });

  it('rolls back a failing migration and keeps earlier ones', () => {
    const dir = migrationsDir({
      '001_widgets.sql': 'CREATE TABLE widgets (id INTEGER PRIMARY KEY);',
      '002_broken.sql': 'CREATE TABLE gadgets (id INTEGER PRIMARY KEY); INSERT INTO nowhere VALUES (1);',
    });
    const db = openDatabase(':memory:');
    expect(() => migrate(db, dir)).toThrow(/Migration 2_broken failed/);

    const versions = db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version);
    expect(versions).toEqual([1]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'gadgets'").get()).toBeUndefined();
  });

  it('rejects badly named or duplicate migration files', () => {
    expect(() => loadMigrations(migrationsDir({ 'add-widgets.sql': '' }))).toThrow(/NNN_description/);
    expect(() =>
      loadMigrations(migrationsDir({ '001_a.sql': '', '001_b.sql': '' })),
    ).toThrow(/Duplicate migration version 1/);
  });
});
