// @ts-check
import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Config compartida por los 7 servicios NestJS — cada uno la re-exporta
 * desde su propio eslint.config.mjs, evitando duplicar la misma config 7
 * veces. Lint sin tipos (no `recommendedTypeChecked`): más rápido y no
 * depende de que el tsconfig de cada servicio incluya todos los archivos
 * lint-eables. Sin integración de prettier-como-regla-de-lint a propósito:
 * el código existente nunca pasó por este formatter, y mezclarlo acá
 * generaría miles de errores de formato en vez de bugs reales. */
export default tseslint.config(
  { ignores: ["eslint.config.mjs", "dist/**", "node_modules/**", "generated/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: "commonjs",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
