# COS profile synthesis rewrite (prompt-only, backend)

One file changes: `supabase/functions/synthesize-cos-profile/index.ts`. Nothing
the leader sees, taps or fills in changes. No onboarding question, wording,
order, optional/mandatory rule, screen, button or flow is touched.

## What actually changes

1. `SYSTEM_PROMPT` is replaced with the supplied five-step version (collect and
   weight inputs → analyse → portray → produce seven sections → produce the
   HTML), including the full chip and goal taxonomy, the null = "Use
   intelligence" rules, the no-fabrication rules and the tone instruction.
2. `buildUserPrompt()` is replaced with the supplied structured version:
   labelled primary source, writing section, chip sections, full goal label
   text, preference lines with explicit null handling, structural signals, meta.
3. `preferred_practice_window` is wired through — three additive lines:
   - `preferredPracticeWindow: string | null;` in the `CosFallbackArgs` type
     (line ~24 block)
   - `preferredPracticeWindow: row.preferred_practice_window ?? null,` in the
     `cosInput` object (line ~860 block)
   - `preferredPracticeWindow: string | null;` in the `buildUserPrompt`
     parameter type
4. `COS_TOOL` gains one additive property inside `risk_flags.items.properties`,
   after `trigger_conditions`:
   `leading_indicator: { type: "string", description: "..." }`.

## One decision to flag

The rendered profile no longer shows a "What is missing" section, per the
product decision. The JSON field `what_is_missing` stays in the schema and the
advisory quality check still counts it (`what_is_missing_thin`). To avoid every
profile picking up a spurious quality gap, the new system prompt will keep
asking the model to populate `what_is_missing` in the JSON while omitting it
from `display_html`. No validator or quality-scoring code is edited.

## Explicitly untouched

- Pipeline, trigger, model fallback chain, persistence, quality gate, gap
  recording, email rendering, HTML class-to-inline-style map.
- Every other `COS_TOOL` property.
- All frontend, iOS, Android, other Edge Functions, database schema and data.
- The existing `buildFallbackCosProfile` local fallback.

## Validation

- `deno check` on the function.
- Existing onboarding/profile contract tests.
- Deploy the single function, then re-run synthesis with `force` for the
  6 September sign-up and read back the stored profile to confirm: no invented
  clock time or reset modality, verbatim freetext phrase present in the
  leadership style and in a `.quote` block, exact role titles preserved,
  `leading_indicator` present on each risk flag, `display_html` over 4,000
  characters with all seven sections.
