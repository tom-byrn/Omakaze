import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: {
      APP_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgres://unused",
    },
  },
});
