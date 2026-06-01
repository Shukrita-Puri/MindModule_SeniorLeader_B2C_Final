// Single source of truth for v8 onboarding taxonomy + validation lives in
// `supabase/functions/_shared/onboardingV8Validation.ts`. This module is a
// thin re-export shim so client code can `import from "@/utils/onboardingV8Validation"`
// without forking the constants. Do not redefine taxonomy here.
export * from "@shared/onboardingV8Validation";

import { MAX_WRITING_URLS } from "@shared/onboardingV8Validation";

/** UI helper: parse a user-typed multi-line / comma-separated URL list. */
export function parseWritingUrlsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_WRITING_URLS);
}