import { openDatabase } from '../db/connection';
import { migrate } from '../db/migrate';
import { createApp } from './app';
import { config } from './config';

const db = openDatabase(config.databaseFile);

const applied = migrate(db);
if (applied.length > 0) {
  console.log(`Applied ${applied.length} pending migration(s)`);
}

const { count } = db.prepare('SELECT COUNT(*) AS count FROM listings').get() as { count: number };
if (count === 0) {
  console.warn('The database has no listings yet. Run `pnpm db:reset` to load the Port Ellis sample data.');
}

const app = createApp({ db, clientDist: config.clientDist });

const server = app.listen(config.port, () => {
  console.log(`Hearth is running at http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
