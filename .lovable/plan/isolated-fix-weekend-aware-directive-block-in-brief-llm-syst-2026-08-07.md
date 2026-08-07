# Isolated Fix: Weekend-aware directive block in Brief LLM system prompt

## Weekend awareness already exists — reuse it, build nothing new

Verified in the codebase:

- `_shared/plan/user-locale.ts` owns the locale rule: `SATURDAY_WEEKLY_COUNTRIES = { SA, KW, QA, BH, OM, IL }` and `planningDayOfWeek(homeCountry)` returns 6 for those countries, 0 elsewhere. Weekend days are therefore Fri+Sat (5,6) for Gulf/Israel and Sat+Sun (6,0) for the rest of the world.
- `_shared/signal-engine/day-kind-detector.ts` (`isWeekend`, `getDayContext`) and `_shared/ceo-behaviour/weekend.ts` both derive from that same helper.
- `compute-outer-readiness/index.ts` already has `isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry)` (line 128) and already computes the LLM-scope `isWeekend` at line 6139. `localeWeekendHomeCountry` is resolved earlier (line 4762) from the profile country with a timezone-derived fallback.

No new weekend definition, helper, or country list will be introduced. The fix only consumes the existing `isWeekend` boolean.

## Goal
Prevent the Brief LLM from emitting workday-shaped language on a user's genuine local weekend.

## Changes

### 1. `supabase/functions/_shared/brief/copy-vocabulary.ts`
- Add a new exported constant `WEEKEND_DIRECTIVE` containing the weekend override block exactly as specified.
- Extend `buildBriefSystemPrompt(opts)` to accept `isWeekend?: boolean`.
- When `opts.isWeekend === true`, append `WEEKEND_DIRECTIVE` at the end of the assembled system prompt so it overrides the work-facing wording in `BODY_FOUR_BEAT_CONTRACT` and the band-gate block.

### 2. `supabase/functions/compute-outer-readiness/index.ts`
- Single-line change at line 6452, passing the already-computed locale-aware flag:
  ```typescript
  const systemPrompt = buildBriefSystemPrompt({ bandValence, isWeekend });
  ```
- No other prompt, gating, or scoring logic changes.

## Verification
- `tsgo` typecheck plus `deno check` on both files.
- Run the existing brief prompt-contract Deno tests and the frontend suite for regressions.
- Deploy `compute-outer-readiness` only (the shared module bundles with it).
- Spot-check two cases: a UK/US Saturday (isWeekend true) and a Gulf/Israel Sunday (isWeekend false — a workday there) to confirm the directive appears only on genuine local weekends.
