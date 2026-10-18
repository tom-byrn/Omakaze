import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/connection';
import { MIGRATIONS_DIR, loadMigrations, migrate } from '../db/migrate';

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

  it('keeps favorites and inquiries when 002 rebuilds the listings table', () => {
    const db = openDatabase(':memory:');
    migrate(db, migrationsDir({ '001_init.sql': readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf8') }));
    db.exec(`
      INSERT INTO neighborhoods (id, slug, name, tagline, description, center_lat, center_lng)
      VALUES (1, 'harborview', 'Harborview', '', '', 47.64, -122.38);
      INSERT INTO listings (id, neighborhood_id, property_type, address, rent, deposit, beds, baths, sqft,
        lat, lng, available_on, pets, laundry, parking, description, agent_name, agent_company, agent_phone, listed_at)
      VALUES (7, 1, 'apartment', '418 Pilot Avenue', 2450, 2450, 1, 1, 720, 47.64, -122.38, '2026-11-01',
        'cats', 'shared', 'street', 'Sunny', 'Maya Okafor', 'Harbor & Hearth Realty', '555-0142', '2026-10-01');
      INSERT INTO favorites (client_id, listing_id) VALUES ('client-a', 7);
      INSERT INTO inquiries (listing_id, client_id, kind, name, email, message)
      VALUES (7, 'client-a', 'question', 'Ana', 'ana@example.com', 'Is it still available?');
    `);

    expect(migrate(db)[0].name).toBe('buying');

    expect(db.prepare('SELECT listing_type, rent, list_price FROM listings WHERE id = 7').get()).toEqual({
      listing_type: 'rent',
      rent: 2450,
      list_price: null,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM favorites').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM inquiries').get()).toEqual({ n: 1 });

    // Foreign keys are back on and point at the rebuilt table.
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => db.exec("INSERT INTO favorites (client_id, listing_id) VALUES ('client-a', 404)")).toThrow(
      /FOREIGN KEY/,
    );
    db.exec('DELETE FROM listings WHERE id = 7');
    expect(db.prepare('SELECT COUNT(*) AS n FROM favorites').get()).toEqual({ n: 0 });
  });

  it('requires the right columns for each listing type', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    db.exec("INSERT INTO neighborhoods (id, slug, name, tagline, description, center_lat, center_lng) VALUES (1, 'a', 'A', '', '', 0, 0)");
    const insert = (columns: string, values: string) =>
      db.exec(`INSERT INTO listings (neighborhood_id, property_type, address, beds, baths, sqft, lat, lng, pets,
        laundry, parking, description, agent_name, agent_company, agent_phone, listed_at, ${columns})
        VALUES (1, 'house', '1 Main St', 3, 2, 1500, 0, 0, 'cats_dogs', 'in_unit', 'garage', 'd', 'a', 'c', 'p',
        '2026-10-01', ${values})`);

    expect(() => insert("listing_type, list_price, sale_status", "'sale', 750000, 'active'")).toThrow(/CHECK/);
    expect(() =>
      insert("listing_type, list_price, sale_status, hoa_monthly, property_tax_rate", "'sale', 750000, 'sold', 0, 0.01"),
    ).toThrow(/CHECK/);
    expect(() =>
      insert("listing_type, list_price, sale_status, hoa_monthly, property_tax_rate", "'sale', 750000, 'active', 0, 0.01"),
    ).not.toThrow();
    expect(() => insert('rent, deposit', '2000, 2000')).toThrow(/CHECK/);
  });

  it('rolls back a migration that leaves dangling foreign keys', () => {
    const dir = migrationsDir({
      '001_parents.sql':
        'CREATE TABLE parents (id INTEGER PRIMARY KEY); CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents (id));',
      '002_orphans.sql': 'INSERT INTO children (id, parent_id) VALUES (1, 42);',
    });
    const db = openDatabase(':memory:');
    expect(() => migrate(db, dir)).toThrow(/1 foreign key violation\(s\) in children/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM children').get()).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });

  it('rejects badly named or duplicate migration files', () => {
    expect(() => loadMigrations(migrationsDir({ 'add-widgets.sql': '' }))).toThrow(/NNN_description/);
    expect(() =>
      loadMigrations(migrationsDir({ '001_a.sql': '', '001_b.sql': '' })),
    ).toThrow(/Duplicate migration version 1/);
  });
});
