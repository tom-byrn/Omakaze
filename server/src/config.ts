import { join, resolve } from 'node:path';

const serverRoot = resolve(import.meta.dirname, '..');

export const config = {
  port: Number(process.env.PORT ?? 4100),
  databaseFile: process.env.HEARTH_DB
    ? resolve(process.env.HEARTH_DB)
    : join(serverRoot, 'data', 'hearth.db'),
  /** Built client served by `pnpm start`. */
  clientDist: join(serverRoot, '..', 'client', 'dist'),
};
