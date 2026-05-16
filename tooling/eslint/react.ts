import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export const reactConfig = defineConfig(
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    languageOptions: {
      ...reactPlugin.configs.flat.recommended?.languageOptions,
      ...reactPlugin.configs.flat["jsx-runtime"]?.languageOptions,
      globals: {
        React: "writable",
      },
    },
  },
  reactHooks.configs.flat["recommended-latest"]!,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Downgraded to warnings as part of the baseline cleanup. These
      // flag legitimate React perf concerns but the codebase has a
      // handful of `useEffect → setState` patterns and React-Compiler
      // memoization-skipped notices that need targeted refactors; we
      // surface them as warnings and address incrementally rather than
      // blocking CI on them.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
    },
  },
);
