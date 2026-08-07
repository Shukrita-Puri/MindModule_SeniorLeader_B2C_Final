# Isolated Fix: Weekend-aware directive block in Brief LLM system prompt

## Goal
Prevent the Brief LLM from emitting workday-shaped language on weekends by injecting a context-specific override into the system prompt when the user's local day is a non-workday.

## Changes

### 1. `supabase/functions/_shared/brief/copy-vocabulary.ts`
- Add a new exported constant `WEEKEND_DIRECTIVE` containing the weekend override block exactly as specified.
- Extend `buildBriefSystemPrompt(opts)` to accept `isWeekend?: boolean`.
- When `opts.isWeekend === true`, append `\n\n` + `WEEKEND_DIRECTIVE` to the assembled system prompt, after the standard blocks and before any leader-voice append happens in the consumer.

### 2. `supabase/functions/compute-outer-readiness/index.ts`
- At the existing call site (~line 6452):
  ```typescript
  const systemPrompt = buildBriefSystemPrompt({ bandValence });
  ```
  change to:
  ```typescript
  const systemPrompt = buildBriefSystemPrompt({ bandValence, isWeekend });
  ```
  where `isWeekend` is already computed at line 6139 via `isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry)`.
- No other prompt logic changes.

## Verification
- Run `tsgo` to confirm TypeScript compiles across both files.
- Run the Brief/Deno test suites to ensure no regression in prompt contract or output validation.
- Deploy only `compute-outer-readiness` (the shared module is bundled with it).
- Spot-check one weekend brief payload to confirm the directive appears in the LLM system prompt and no work-meeting language leaks into beat (c).
