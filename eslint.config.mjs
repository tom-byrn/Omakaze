import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
      "data/**",
      "examples/**",
      // Files of the fictional repository the demo pull requests change; not part of this project.
      "scripts/demo-data/repo/**",
      "test-results*/**",
      "playwright-report*/**",
    ],
  },
  {
    // Playwright fixtures receive a callback named `use`, which the React hooks rule mistakes for a hook.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default config;
