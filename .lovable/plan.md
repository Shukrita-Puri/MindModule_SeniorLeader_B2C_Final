## Scope

Two small cleanups on the Week-Ahead trigger contract, plus two documentation-only touch-ups requested by the reviewer, then a live smoke-test of the smart-nudges evaluator for `shukrita@mindmodule.me`.

## 1. Templatize the `weekly_planning` variant title by home country

`supabase/functions/smart-nudges/index.ts` line ~4327 currently hard-codes:

```
weekly_planning: { title: "Sunday reset", body: "…before Monday starts…" }
```

For Saturday-planning countries (SA, KW, QA, BH, OM, IL) the copy is misleading. Change:

- Compute `isSaturdayPlanning = planningDayOfWeek(homeCountry) === 6` inside the same builder that already receives `wai.homeCountry` (imported from `_shared/plan/week-ahead-mode.ts`).
- Swap the `weekly_planning` variant to:
  - Saturday planning countries → `title: "Week reset"`, `body: "10 priority choices can shape the week before Sunday starts - log in to prep your mind tonight."`
  - Sunday planning countries (default) → `title: "Sunday reset"`, `body` unchanged.
- Keep `variantId` stable at `week_ahead_picker_invite::weekly_planning` so per-reason dedupe and analytics do not break.

No other variants change. Other reasons (`end_of_pto`, `end_of_public_holiday`, `end_of_long_weekend`) are already day-neutral copy.

## 2. Documentation cleanups (no runtime effect)

- `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql` — replace remaining `sunday` / `sunday_planning` reason literals in comments and any WHERE clauses with `weekly_planning`; update `end_of_holiday` → `end_of_public_holiday`, `long_weekend_end` → `end_of_long_weekend` where present.
- `docs/GENERATE_MASTERY_PLAN_SSOT.md` §17 — refresh the reason vocabulary table and priority-order note so it matches the current `WeekAheadReason` union in `_shared/plan/week-ahead-mode.ts`.

## 3. Reviewer additions — documentation only

**3a. Ordering precedence note.** In `supabase/functions/_shared/plan/week-ahead-mode.ts`, expand the top-of-function comment on `evaluateWeekAheadMode` to state explicitly:

> Return-from-break reasons take priority in the order **PTO → public holiday → long weekend → weekly planning**. First matching reason wins. A day that is both the last day of PTO and the last day of a long weekend will be reported as `end_of_pto` by design.

Mirror this note in `docs/GENERATE_MASTERY_PLAN_SSOT.md` §17.

**3b. Country list rationale.** Add a comment block above `SATURDAY_WEEKLY_COUNTRIES` explaining:

> Countries where the working week begins on Sunday, so the weekly planning reminder fires Saturday evening. Based on **home country**, not current travel location. Members: Saudi Arabia (SA), Kuwait (KW), Qatar (QA), Bahrain (BH), Oman (OM), Israel (IL).

No code change — comment only.

## 4. Deploy and smoke-test

- Deploy `smart-nudges` (only function whose runtime changed; `_shared/plan/week-ahead-mode.ts` is comment-only but its consumers do not need redeploy).
- Invoke `smart-nudges` in dry-run mode for `shukrita@mindmodule.me`, checking:
  - the evaluator returns a `week_ahead_picker_invite` for today (Sunday, `weekly_planning` reason, GB home country → "Sunday reset" copy path)
  - `variantId = week_ahead_picker_invite::weekly_planning`
  - dedupe key logs match the per-reason contract
- Report the raw dry-run payload back so you can confirm the copy and reason before any live send.

## Files touched

| File | Change type |
| --- | --- |
| `supabase/functions/smart-nudges/index.ts` | Runtime — templatized `weekly_planning` copy |
| `supabase/functions/_shared/plan/week-ahead-mode.ts` | Comment only — precedence + country rationale |
| `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql` | Doc cleanup |
| `docs/GENERATE_MASTERY_PLAN_SSOT.md` | Doc cleanup + precedence note |

## Out of scope

- No change to trigger precedence or evaluation logic.
- No change to dedupe, deep-link routing, or notification priority.
- No change to `list-week-ahead-priorities`, `evaluate-week-ahead-mode`, or the frontend.
