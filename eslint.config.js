import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  }
  ,
  {
    // Calendar dedupe guard: raw `.from('calendar_events')` reads bypass
    // mergeCalendarEvents() and return cross-provider duplicates. Only
    // shared merge/sync layers may query the table directly. See
    // mem/architecture/event-load-and-dedupe-rules.md and the repo-level
    // allow-list in src/__tests__/calendarEventsRawReadGuard.test.ts.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/utils/rules/**",
      "src/__tests__/calendarEventsRawReadGuard.test.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.type='Literal'][arguments.0.value='calendar_events']",
          message:
            "Do not read calendar_events directly. Import mergeCalendarEvents from '@/utils/rules/calendarEvents' and pipe rows through it, or add the file to the allow-list in src/__tests__/calendarEventsRawReadGuard.test.ts with a plan.md follow-up.",
        },
      ],
    },
  }
);
