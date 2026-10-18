import { rmSync } from 'node:fs';
import { relative } from 'node:path';
import { config } from '../src/config';
import { openDatabase } from './connection';
import { migrate } from './migrate';
import { seed, type SeedSummary } from './seed';

const USAGE = 'Usage: tsx db/cli.ts <migrate|seed|reset>';

function describe(file: string): string {
  return relative(process.cwd(), file) || file;
}

function describeSeed({ rentals, sales, neighborhoods }: SeedSummary): string {
  return `${rentals} rentals and ${sales} homes for sale in ${neighborhoods} neighborhoods`;
}

function run(command: string | undefined): void {
  const file = config.databaseFile;

  switch (command) {
    case 'migrate': {
      const applied = migrate(openDatabase(file));
      console.log(
        applied.length
          ? `Applied ${applied.map((m) => `${String(m.version).padStart(3, '0')}_${m.name}`).join(', ')}`
          : 'Database is up to date',
      );
      return;
    }
    case 'seed': {
      const db = openDatabase(file);
      migrate(db);
      const summary = seed(db);
      console.log(`Seeded ${describeSeed(summary)}`);
      return;
    }
    case 'reset': {
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${file}${suffix}`, { force: true });
      }
      const db = openDatabase(file);
      const applied = migrate(db);
      const summary = seed(db);
      db.close();
      console.log(`Reset ${describe(file)}: ${applied.length} migrations, ${describeSeed(summary)}`);
      return;
    }
    default:
      console.error(USAGE);
      process.exitCode = 1;
  }
}

run(process.argv[2]);
