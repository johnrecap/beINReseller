import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These existing Node tools run as CommonJS; require is their module API.
    files: ["check-db.cjs", "check-roles.js", "scripts/check-prisma-schema-sync.js", "scripts/purge-operation-session-data.cjs", "output/playwright/phase4-ui-smoke.cjs", "output/playwright/review-notes-smoke.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    ".agent/**",
    ".specify/**",
    ".worktrees/**",
    "docs/**",
    "specs/**",
    "tmp/**",
    "src/generated/prisma/**",
    "worker/dist/**",
    "worker/logs/**",
  ]),
]);

export default eslintConfig;
