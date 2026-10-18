import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
    environment: 'node',
    poolOptions: {
      // node:sqlite still prints an ExperimentalWarning on Node 22.
      forks: { execArgv: ['--disable-warning=ExperimentalWarning'] },
    },
  },
});
