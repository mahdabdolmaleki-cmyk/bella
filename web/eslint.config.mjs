import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default defineConfig([
  // Next 15 still publishes an eslintrc-style preset; FlatCompat converts it
  // to ESLint 9's flat-config format instead of treating the object as an array.
  ...compat.extends("next/core-web-vitals"),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
