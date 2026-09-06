# Light Days: one honest definition, three surfaces, one nudge

## What I found

The system already knows what kind of day it is. One shared classifier decides between a working day, a light routine day, a rest day, time off, and a public holiday, and the Brief, the Plan and the notifications all read it. So the foundation is there — but the three surfaces do different things with it.

- **Brief** — already the strongest. It names the day (weekend, holiday, time off, light day) and turns the copy toward active recovery. Mostly needs a top-up, not a rebuild.
- **Plan** — today a rest day produces **zero practices** on purpose, and the app shows a calm "nothing scheduled" state. That is the opposite of what you're asking for. Deliberate past decision, so changing it is a real change, not a bug fix.
- **Notifications** — time off and holidays already collapse to roughly one message a day, but by accident of two separate switches rather than one rule. **Weekends do not collapse** — they still send more than one. And the time-of-day preference captured during sign-up is never read.

## What I'll change

### 1. One shared "light day" definition
Extend the existing day classifier with a single exported answer: *is today a light day, and why* (weekend, holiday, time off, last day of a long weekend, or a working day with zero or one meeting). Everything below reads that one answer, so the three surfaces can never disagree.

Note: today a working day with one meeting is treated as a normal working day. Under your definition it becomes a light day. That's the one behavioural widening here.

### 2. Brief
On a light day the Brief opens by naming the day plainly, then frames the whole read as recovery and paying back the load carried in from the previous days, rather than performance. Extend the existing recovery copy so it also references the recent heavy-day carry-over, and make sure the "one meeting" case gets the same treatment as a fully empty day.

### 3. Plan — light-day three-slot recovery arc
Replace the zero-practice rest-day behaviour with a purpose-built three-slot light day:
- **Morning** — set the intention for recovery.
- **Afternoon** — hold it steady.
- **Evening** — protect what was recovered.

Practices are picked from the existing library only (recovery/restoration-tagged), never invented. The reasons attached to each slot say plainly that this is a light day and what it's protecting. The app's rest-day empty state is retired, and the existing rest-day test is rewritten to lock the new three-slot contract.

### 4. Notifications — exactly one a day, at the user's time
- Replace the two ad-hoc switches with one rule: on a light day the daily allowance is **1**, applied identically to weekends, holidays, time off and near-empty working days.
- Send it at the time the user chose during sign-up. If they chose "use intelligence", pick from the same recovery-window logic used elsewhere, respecting their quiet hours.
- Copy for that single message points at the light-day plan, so the habit is one visit a day.

## Technical notes

- SSOT: extend `supabase/functions/_shared/availability/availability-classifier.ts` with `classifyLightDay()` returning `{ isLightDay, kind, reason }`; `LIGHT_ROUTINE` and the ≤1-meeting case join `PTO | PUBLIC_HOLIDAY | REST_DAY` for this purpose only. `classifyDay`'s existing off-day meaning stays untouched to avoid regressions elsewhere.
- Brief: `_shared/brief/day-shape.ts` gains the light-day kind; recovery/carry-over copy extended in `_shared/brief/copy-vocabulary.ts` and `deterministic-brief.ts`. LLM prompt directive plus deterministic fallback both updated so the two paths match.
- Plan: `_shared/jit/slot-allocator.ts` — replace the `rest_day → slots: []` branch with a `light_day` arc of three slots (`recovery_intention`, `recovery_hold`, `recovery_protect`), sourced through the existing content-surfacing allowlist. `generate-mastery-plan/index.ts` passes the light-day verdict through `deriveStructuralDayFlags`. Frontend: `TodayThreePriorities.tsx` drops `isRestDayPlan`; rewrite `src/__tests__/planRestDayContract.test.ts`.
- Nudges: `smart-nudges/index.ts` — day-shape-aware cap replacing flat `DAILY_NOTIFICATION_CAP = 3`; remove the scattered `ptoMode` returns in `nudge_two` / `nudge_three`; read `onboarding_v8_responses.brief_timing` / `preferred_practice_window` plus `notification_preferences` windows, DND and quiet days to place the single send.
- Tests: Deno tests for the new classifier cases (empty weekday, one-meeting weekday, Saturday, holiday, long-weekend last day), light-day plan arc, and single-nudge cadence; existing Vitest suite must stay green.

## Open question

The stored preference is coarse (a broad morning/evening window, not a clock time). I'll place the single nudge inside the chosen window rather than at an exact time — tell me if you'd rather I add a precise time picker to the notification settings instead.
