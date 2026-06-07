
## Goal

On Saturdays, Sundays, and the last day of a PTO/holiday/long-weekend window, replace the day-of self-regulation framing with a **Week-Ahead Planning** flow:

1. Brief looks **backward** (week just gone: load/recovery summary).
2. Plan page surfaces **~10 important upcoming-week events** sourced from the existing important-event classifier.
3. User marks which are real priorities (signal-vs-noise).
4. Selections persist as a learning memory and re-weight future JIT/Plan ranking.
5. Optional single self-reg practice remains available but is not the primary task.

No new classifier, no new edge function family — reuse `list-replacement-calendar-events`, `event-classifier`, `stakesLevel`, `jit-candidates`, and existing weekend/PTO detectors from `_shared/ceo-behaviour/weekend.ts` + §1 holiday detectors.

---

## Trigger logic (server-derived, single source)

New helper `_shared/plan/week-ahead-mode.ts`:

```text
isWeekAheadMode(ctx) = true when ANY of:
  - dayOfWeek ∈ {6 (Sat), 0 (Sun)} AND not travelDay AND not full-working-weekend
  - lastDayOfPtoWindow(ctx)         // ptoTodayAllDay && !ptoTomorrowAllDay
  - lastDayOfHolidayBlock(ctx)      // holidayAllDayEventToday && next local day is a workday
  - lastDayOfLongWeekend(ctx)       // Sun OR Mon-holiday-eve preceded by ≥2 consecutive off days
```

Returns `{ active, reason, lookbackDays, lookaheadDays }`. Consumed by both Brief and Plan so they agree.

Existing `fullWorkingWeekend` (≥3 meetings or ≥4h back-to-back or weekend work block) **suppresses** week-ahead mode — those days run weekday cadence as today.

---

## 1. Brief: backward-looking variant

Edge: `compute-outer-readiness` (and the shared brief prompt builder).

- When `weekAheadMode.active === true`, swap the prompt block:
  - Drop today's anchor / forward "ahead of today's load".
  - Add a new `weekRecapBlock(ctx, lookbackDays=7)` with: total meetings, back-to-back hours, ≥high-stakes count, sleep mean, HRV mean vs 30d baseline, recovery deficit flag, completed-priorities count.
  - Why-line constraints: must reference week just gone, never name a tomorrow event.
- `brief_snapshots.driver = 'week_recap'` (new enum value) so client + Plan can branch on it.
- Telemetry: `briefMode: 'week_recap' | 'day_anchor'`.

No change to MRS scoring or signal pills shape — only copy + prompt block.

---

## 2. Plan page: Week-Ahead Priorities surface

Reuse `PlanPage.tsx` + `TodayThreePriorities.tsx` (same container, no new route).

### 2.1 New edge function: `list-week-ahead-priorities`

Thin orchestrator (≤200 LOC). Pure composition over existing modules:

```text
input:  { userId, localDate, lookaheadDays = 7 }
steps:
  1. Pull events for [now, now + 7d local] via the same query as
     list-replacement-calendar-events (collapseDuplicateEvents, period tagging).
  2. classifyEvent + stakesLevel on each (existing event-classifier).
  3. Score with rankJitCandidates() reused from generate-mastery-plan (§15 SSOT),
     boosts: growth-area alignment (+15), priority-tag history (+10),
     HRV historical event impact (+10), historical-cancel-as-noise penalty (−20).
  4. Apply hard gates: educational-non-organiser drop, JIT_THRESHOLD_UNIFIED floor.
  5. Per-day cap (max 3/day) + per-category cap (max 3 of any one category)
     to guarantee variety, then take top 10.
  6. Return [{ eventId, title, startTime, period, category, stakesLevel,
              score, scoreReasons[], priorPriorityTagCount,
              priorCancelAsNoiseCount }] + weekAheadMode payload.
```

RLS via existing auth path (Auth0 + dev-mode header). No new DB writes here.

### 2.2 UI

New component `src/components/home/WeekAheadPriorities.tsx`:

- Header: "Plan the week ahead" + Sunday-/post-break-appropriate subtitle.
- List of 10 cards grouped by day (Mon–Sun).
- Each card: title, time, stakes pill, 1-line `why` from `scoreReasons[0]`.
- Per-card actions (single-tap toggles, optimistic):
  - **Priority** (star) — marks as real priority for the week.
  - **Not this week** — temporary deprioritise (does NOT poison future weeks).
  - **Never this type** — permanent: store as anti-pattern keyed to category.
- Footer: "Optionally do one reset" → opens a single recommended self-reg practice from existing `practice-selector` (`deriveSlotIntent(weekAheadMode)` → meta-renewal/regulate). Not a full 3-slot plan.

`TodayThreePriorities.tsx` adds early branch: if `weekAheadMode.active && driver === 'week_recap'`, render `<WeekAheadPriorities />` instead of fetching `generate-mastery-plan`. Auth users + dev mode both route through the same hook, so behaviour is uniform.

`DailyRitual.tsx` empty-state remains as fallback when no upcoming events exist.

---

## 3. Memory write — learning loop

New table (single migration):

```text
event_priority_memory
  user_id          text not null
  event_category   text not null   -- from event-classifier
  event_type_key   text not null   -- normalized title bucket (e.g. "1on1", "board_review")
  signal           text not null check (signal in
                     ('priority','not_this_week','never','cancelled_as_noise',
                      'cancelled_keep_surfacing'))
  source           text not null   -- 'week_ahead_picker' | 'priority_tag' | 'cancel_feedback'
  occurred_at      timestamptz default now()
  meta             jsonb
  primary key (user_id, event_category, event_type_key, signal, occurred_at)
```

GRANTs + RLS deny-by-default; writes only via edge function service role.

New edge function: `record-event-priority-signal` (≤120 LOC). Inputs: `{ eventId, signal, source }`. Resolves `event_type_key` from the live event row, writes one row.

### Read-side integration (the actual learning)

In `rankJitCandidates()` (used by both `generate-mastery-plan` and `list-week-ahead-priorities`) add a new boost stage `applyEventPriorityMemory(candidate, memory)`:

```text
+10  per 'priority' in last 60 days for same (category, type_key)
+ 5  per 'cancelled_keep_surfacing' (still important, just rescheduled)
-15  per 'not_this_week'  in last 14 days   (decays after 14d)
-40  hard demotion if 'never' exists        (drops below JIT_THRESHOLD_UNIFIED → filtered out)
-25  per 'cancelled_as_noise' in last 60 days
clamp net memory delta to [-50, +30] to avoid runaway.
```

`scoreReasons[]` surfaces `"prior priority ×N"` / `"you've deprioritised this type"` so the user sees why an event ranks where it does.

---

## 4. Cancel-with-feedback bridge (existing surface)

When a user cancels a JIT plan or skips an event today and the existing feedback modal asks why:

- "Not important right now" → write `cancelled_keep_surfacing` (still surface next time).
- "Never important to me" → write `never`.
- "Not a priority this week" → write `not_this_week`.

`PlanFeedbackModal.tsx` already collects rating + free text; extend its onSubmit path (only when triggered from a JIT priority, not a self-reg slot) to call `record-event-priority-signal` with the appropriate mapping. No new modal.

---

## 5. Notification / pop-up tying

Reuse Smart Nudges:

- New nudge rule `weekAheadPickerInvite` in `_shared/nudges/`:
  - Fires Sat 09:00–11:00 local OR Sun 16:00–19:00 local OR the evening of a detected last-PTO/holiday day.
  - Suppressed if `fullWorkingWeekend` is true or user already opened the picker today.
  - Deep link: `/plan?mode=week-ahead`.
- PlanPage reads `?mode=week-ahead` to force-render the picker even if `weekAheadMode` evaluation is borderline (manual entry).

---

## 6. Auth users + Dev mode parity

Single code path — both invoke the new edge function via `supabase.functions.invoke('list-week-ahead-priorities', …)` from the same hook as `TodayThreePriorities`. Dev-mode bypass headers (`x-dev-user-id`) handled identically to existing edge functions. No client-side fork.

---

## 7. SSOT documentation update

Append `§17 Week-Ahead Mode (Weekend / Post-Break)` to `docs/GENERATE_MASTERY_PLAN_SSOT.md`:

- §17.1 Trigger predicate (week-ahead-mode.ts)
- §17.2 Brief swap to `week_recap` driver
- §17.3 `list-week-ahead-priorities` scoring (reuse §15 + memory boosts)
- §17.4 `event_priority_memory` schema + write paths
- §17.5 Read-side memory integration in `rankJitCandidates`
- §17.6 UI contract (WeekAheadPriorities component)
- §17.7 Nudge trigger
- §17.8 Suppression: full-working-weekend, travel days, manual override

Also update:
- `mem/features/mastery-plan/slot-model-v5.md` — note week-ahead mode exception.
- `mem/features/notifications/smart-nudges-mvp-framework.md` — add new rule.

---

## Technical details

### Files to add
- `supabase/functions/_shared/plan/week-ahead-mode.ts` (+ test)
- `supabase/functions/list-week-ahead-priorities/index.ts`
- `supabase/functions/record-event-priority-signal/index.ts`
- `supabase/functions/_shared/plan/event-priority-memory.ts` (read + boost helpers, + test)
- `supabase/functions/_shared/brief/week-recap-block.ts` (+ test)
- `src/components/home/WeekAheadPriorities.tsx`
- `src/hooks/useWeekAheadMode.ts`
- new migration: `event_priority_memory` table + GRANTs + RLS deny-by-default + service-role policy

### Files to modify
- `supabase/functions/compute-outer-readiness/index.ts` — branch on `weekAheadMode.active` to use `week_recap` prompt block and stamp `driver='week_recap'`.
- `supabase/functions/generate-mastery-plan/index.ts` — call `applyEventPriorityMemory` inside `rankJitCandidates`; expose `scoreReasons`.
- `src/components/home/TodayThreePriorities.tsx` — early branch to `<WeekAheadPriorities />` when `driver === 'week_recap'`.
- `src/pages/PlanPage.tsx` — honour `?mode=week-ahead` query param.
- `src/components/home/PlanFeedbackModal.tsx` — relay cancel-reason mapping to `record-event-priority-signal` for JIT priorities.
- `docs/GENERATE_MASTERY_PLAN_SSOT.md` — add §17.

### Out of scope
- MRS scoring changes
- New onboarding step
- iOS native UI changes (deep link reuses existing scheme)
- Changing the existing Today plan on weekdays

### Rollback
Feature-flag `WEEK_AHEAD_MODE` (env var) gates: brief driver swap, the early UI branch, the nudge rule, and the new edge function. Migration is additive (new table only) and safe to leave in place on revert.
