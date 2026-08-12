import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next ships its "core-web-vitals"/"typescript" presets in the
// legacy eslintrc `{ extends: [...] }` shape, not flat-config arrays (this
// is what broke the previous `...nextVitals` spread — see docs/SETUP.md's
// former "Known follow-ups" entry). FlatCompat is the documented bridge
// Next.js itself recommends for exactly this mismatch.
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // This codebase's established convention (see any `useActionState`
      // server action handler) for intentionally-unused parameters whose
      // signature is fixed by a library API (e.g. `_prevState` in every
      // `useActionState` action) — underscore-prefixed names are exempted
      // rather than requiring a lint-disable comment at every call site.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".local-storage/**",
    "database/.pglite-data/**",
  ]),
];

export default eslintConfig;
