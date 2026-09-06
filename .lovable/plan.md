# Light Days: one honest definition, three surfaces, one nudge

## What I found

The system already knows what kind of day it is. One shared classifier decides between a working day, a light routine day, a rest day, time off, and a public holiday, and the Brief, the Plan and the notifications all read it. The foundation is there — but the three surfaces do different things with it.

- **Brief** — the strongest already. It names the day (weekend, holiday, time off, light day) and turns the copy toward active recovery. Needs a top-up, not a rebuild.
- **Plan** — today a rest day produces **zero practices** on purpose, and the app shows a calm "nothing scheduled" state. That is the opposite of what you want on the first weekend day.
- **Notifications** — time off and holidays collapse to roughly one message a day, but through two separate switches rather than one rule. **Saturday sends nothing at all** — that matches what happened yesterday. And the time-of-day preference captured during sign-up is never read.

## The rule we're setting

A **light day** is: a working day with zero or one meeting, a holiday, PTO/OOO, or a weekend day — **excluding the final day** of any of those runs. The final day (Sunday for most countries, Saturday for Israel and the Gulf; the last day of a holiday, PTO block or long weekend) keeps today's week-ahead behaviour, completely unchanged.

A weekend with several meetings is a working weekend and is treated as a normal working day, as it is today.

| Day | Brief | Plan | Notification |
| --- | --- | --- | --- |
| Light day (incl. first weekend day) | names it, recovery frame | 3-slot recovery arc | 1 per day |
| Last day of weekend / holiday / PTO | unchanged | unchanged (week-ahead) | evening week-ahead only |
| Working weekend | unchanged | unchanged | unchanged |

## What I'll change

### 1. One shared light-day definition
Extend the existing day classifier with a single exported answer: *is today a light day, and why* — including the "is this the last day of the run" test, which is already available for long weekends and gets reused for holidays, PTO and ordinary weekends. Everything below reads that one answer, so the surfaces can never disagree.

### 2. Brief
On a light day the Brief opens by naming the day plainly, then frames the whole read as recovery and paying back the load carried in from previous days rather than performance. Extend the existing recovery copy so it also references recent heavy-day carry-over, and make sure the one-meeting case gets the same treatment as a fully empty day. Last-day framing untouched.

### 3. Plan — light-day three-slot recovery arc
Replace the zero-practice behaviour on light days with a purpose-built arc:
- **Morning** — set the intention for recovery.
- **Afternoon** — hold it steady.
- **Evening** — protect what was recovered.

Practices come from the existing library only (recovery/restoration-tagged), never invented. On the last day of a weekend, holiday or PTO run the plan keeps its current week-ahead behaviour. The rest-day empty state stays only for that unchanged path; the existing rest-day test is extended to cover both branches.

**When the light day holds one meeting**, that meeting is judged on its real importance using the same A–H scoring the rest of the app uses. If it is genuinely high-stakes — a board meeting, an investor conversation, a conference, travel, an influence moment — the plan names it and builds preparation for it into whichever of the three slots sits before it. The day stays a light day overall: the other two slots stay recovery. A low-stakes single meeting changes nothing; all three slots stay recovery.

### 4. Notifications
- One rule: on a light day the allowance is **1 message**, applied identically to weekends, holidays, PTO and near-empty working days — which also fixes the silent Saturday.
- On the last day of a weekend/holiday/PTO run: the evening week-ahead message only, as today.
- Send time follows the sign-up preference:

| Preference | Light working day, no meetings | Weekend / holiday / PTO | Light working day with one meeting |
| --- | --- | --- | --- |
| Morning | 08:00 | 09:00 | anchored to the meeting |
| Evening | 17:00 | 17:00 | anchored to the meeting |
| Let the system decide | evening / end of day | evening / end of day | anchored to the meeting |

  "Anchored to the meeting" means the usual pre-event timing already used for high-stakes prep, rather than a fixed clock time. Quiet hours and do-not-disturb always win.
- Copy points at the light-day plan, so the habit is one visit a day.

## Technical notes

- SSOT: `supabase/functions/_shared/availability/availability-classifier.ts` gains `classifyLightDay()` → `{ isLightDay, kind, isLastDayOfRun, reason }`. Reuses `isLastDayOfLongWeekend` and generalises it to holiday/PTO runs. `classifyDay`'s existing off-day semantics stay untouched. Weekend day identity keeps coming from `planningDayOfWeek()` in `_shared/plan/user-locale.ts` (Fri/Sat for `SATURDAY_WEEKLY_COUNTRIES`).
- Brief: `_shared/brief/day-shape.ts` gains the light-day kind; copy extended in `_shared/brief/copy-vocabulary.ts` and `deterministic-brief.ts` (LLM directive and deterministic fallback in step). The single-meeting case names the event via the existing title-first rule.
- Single-meeting stakes: reuse `resolveEvent()` / `scoreImportance()` (A–H, `_shared/events/resolve-event-category.ts` + `_shared/rules/calendarEvents.ts`) — no new classifier. Categories A–C plus travel/conference promote the meeting to "prep-worthy".
- Plan: `_shared/jit/slot-allocator.ts` — the `rest_day → slots: []` branch splits into `light_day` (three slots: `recovery_intention`, `recovery_hold`, `recovery_protect`) and the unchanged last-day/week-ahead branch. When a prep-worthy meeting exists, the slot preceding its start time swaps to a `prepare` role using the existing prep selection path. `generate-mastery-plan/index.ts` passes the verdict through `deriveStructuralDayFlags`. Frontend `TodayThreePriorities.tsx` keeps `isRestDayPlan` only for the last-day path; `src/__tests__/planRestDayContract.test.ts` extended.
- Nudges: `smart-nudges/index.ts` — day-shape-aware cap replacing flat `DAILY_NOTIFICATION_CAP = 3`; remove scattered `ptoMode` returns in `nudge_two`/`nudge_three`; add the missing first-weekend-day send (root cause of the silent Saturday to confirm in the evaluator traces before the fix lands). Map `onboarding_v8_responses.brief_timing` (Morning / Evening / Use intelligence → null) to the send times in the table above, clamped by `notification_preferences` windows, DND and quiet days. Sunday/Saturday week-ahead evening path untouched.
- Verification: replay `smart-nudges` in dry-run for the affected account across a Saturday and a Sunday and read the evaluator traces, plus Deno tests for the new classifier cases, the light-day plan arc, the single-meeting prep swap, and each timing-preference branch; existing Vitest suite must stay green.

