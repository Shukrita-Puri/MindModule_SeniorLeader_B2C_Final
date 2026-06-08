## Goal

Finish §17 of `docs/GENERATE_MASTERY_PLAN_SSOT.md`: the Week-Ahead picker uses the **same ranker the weekday Plan uses** plus the **learning loop** from `event_priority_memory`. Ship the four staged items (brief drivers, memory boost in `rankJitCandidates`, cancel-feedback bridge, `weekAheadPickerInvite` nudge).

**Day-mode contract (this update):**

| Day                                                    | Brief driver                | Plan surface           | Nudge                   |
|--------------------------------------------------------|-----------------------------|------------------------|-------------------------|
| Mon–Fri                                                | Standard forward driver     | Weekday Plan           | Standard nudge ladder   |
| **Saturday**                                           | **`week_recovery`** (new)   | **Weekday Plan**       | Standard nudge ladder   |
| **Sunday**                                             | `week_recap` (week-ahead)   | Week-Ahead picker      | `weekAheadPickerInvite` (16–19 local) |
| Last-day PTO / holiday / long-weekend (workday ahead)  | `week_recap`                | Week-Ahead picker      | `weekAheadPickerInvite` (16–19 local) |
| Travel / full-working-weekend                          | Standard forward driver     | Weekday Plan           | Standard nudge ladder   |

Saturday is a **self-regulation / recovery day** — not week-ahead. The Saturday brief looks **backwards across the week gone by** to frame recovery, and flags any **weekend meetings** so recovery accounts for them.

## 1. Trigger predicate — Saturday flips to recovery

File: `supabase/functions/_shared/plan/week-ahead-mode.ts → evaluateWeekAheadMode`

- Remove the `dayOfWeek === 6 → 'saturday'` branch from the active ladder. Saturday is no longer a `weekAheadMode.active` day on its own.
- Keep ladder order:
  1. `manualOverride` → `manual_override`
  2. `travelDay` → inactive
  3. `fullWorkingWeekend` → inactive
  4. `ptoTodayAllDay && !ptoTomorrowAllDay` → `last_day_pto`
  5. `holidayAllDayEventToday && tomorrowIsWorkday` → `last_day_holiday`
  6. `consecutiveOffDaysBefore ≥ 2 && tomorrowIsWorkday` → `last_day_long_weekend`
  7. `dayOfWeek === 0` → `sunday`
- Add a separate predicate `isSaturdayRecoveryDay(input)` returning `true` when `dayOfWeek === 6 && !travelDay && !fullWorkingWeekend`. Brief uses this directly; Plan never reads it (Plan stays weekday cadence).

Update existing tests in `week-ahead-mode.test.ts`: Saturday no longer activates Week-Ahead; Sunday + last-day-PTO/holiday still do; `isSaturdayRecoveryDay` covers Saturday + suppression edges.

## 2. Brief drivers in `compute-outer-readiness`

File: `supabase/functions/compute-outer-readiness/index.ts`

- Import `evaluateWeekAheadMode` and `isSaturdayRecoveryDay`. Evaluate both early from `localNow`.
- Driver resolution (first-match-wins):
  1. `weekAheadMode.active` → `driver = 'week_recap'`, swap LLM anchor to a **week-recap block**: last 7 local days mean meeting load, mean sleep, recovery mean vs 30-day baseline, HRV delta vs baseline, `completed_priorities` count from `mastery_plan_completions`. Why-line guardrails: must reference the prior week; reject any future event title.
  2. `isSaturdayRecoveryDay` → `driver = 'week_recovery'`, swap LLM anchor to a **recovery block**: same week-gone-by metrics as above **plus** a `weekendEvents[]` snippet (events in the Sat–Sun window with stakes ≥ medium, titles + times). Why-line guardrails: must reference recovery / the week behind; **may** name a weekend meeting if `weekendEvents.length > 0`; must not name a Mon–Fri future event.
  3. Otherwise → existing forward driver.
- MRS scoring, signal-pill shape, and the atomic brief contract are unchanged. Only the prompt anchor block and `driver` value vary.

Add tests: Sat → `week_recovery` with weekend-event snippet present; Sat + travel → forward driver; Sun → `week_recap`; Mon → forward driver; manual override forces `week_recap` on any day.

## 3. Week-Ahead picker = unified ranker + memory (no per-day cap)

File: `supabase/functions/list-week-ahead-priorities/index.ts`

- After dedupe + noise/educational filtering, build `RankableEventInput[]` and call `rankJitCandidates(inputs, nowMs)` — same scoring as weekday Plan (stakes-base + category weight + severity + demand profile + proximity).
- Collapse to **one row per event** (best-scoring phase wins).
- Apply `applyEventPriorityMemory(memoryIndex, { eventCategory, eventTypeKey })`:
  - Add `mem.delta` to the score; drop on `mem.hardDemote === true`; surface `mem.reasons` into `scoreReasons[]`.
- Build `scoreReasons[]` from `RankedJitCandidate.components` (`base ≥ 30` → "high stakes"; `categoryId === 'A'` → "decision-critical"; organiser → "you're organising"; ≥5 attendees → "broad audience"); append memory reasons; keep first 3.
- **Selection:** sort by final score desc, take **top 10**.
  - **Remove the per-day cap** (this is a weekly planner).
  - Keep a **soft per-category cap = 4** so a dominant bucket still leaves room for board/investor events.
  - Remove the hard `score < 10` floor.
- Re-sort the chosen 10 chronologically for UI rendering.

PlanPage continues to render the picker only when `useWeekAheadMode().active` is true (Sunday / last-PTO / last-holiday / `?mode=week-ahead`).

## 4. §17.5 — `applyEventPriorityMemory` in weekday `rankJitCandidates`

- File: `supabase/functions/_shared/events/jit-candidates.ts`
  - Extend `RankableEventInput` with optional `memoryDelta?: number` and `memoryHardDemote?: boolean`.
  - Per-phase score adds `memoryDelta ?? 0`, exposed as `components.memory`. Skip events when `memoryHardDemote === true`.
- File: `supabase/functions/generate-mastery-plan/index.ts`
  - Load `loadPriorityMemoryForUser(supabase, userId)` once at both `rankJitCandidates` call sites; populate `memoryDelta`/`memoryHardDemote` from `applyEventPriorityMemory(...)` per event.
  - Gate on `Deno.env.get('WEEK_AHEAD_MEMORY_BOOST') === 'true'`. When off, behaviour is byte-identical to today.

Extend `event-priority-memory.test.ts`: a `priority` row lifts an event above an equal-stakes peer; a `never` row removes it.

## 5. Cancel-feedback → `record-event-priority-signal` bridge

In `SlotCancelFeedbackModal.onSubmit` (invoked from `TodayThreePriorities.tsx` ~L1728): when the slot is JIT-bound (`eventId` + `eventTitle`), fire-and-forget POST `record-event-priority-signal`:

- reason `"now"`  → `signal: 'cancelled_keep_surfacing'`
- reason `"ever"` → `signal: 'cancelled_as_noise'`
- `source: 'cancel_feedback'`; include free-text in `meta`.

Reuse the same invoke helper + auth/dev-mode parity as `WeekAheadPriorities`. Pure side-effect — never block the cancel UX on failure. Non-JIT cancels are untouched.

## 6. `weekAheadPickerInvite` nudge rule

File: `supabase/functions/smart-nudges/index.ts`

- Register nudge type `weekAheadPickerInvite` (family + static-fallback copy + system prompt branch).
- **Trigger windows (local time):**
  - **Sunday 16:00–19:00**
  - **16:00–19:00 on a detected last-PTO / last-holiday / last-long-weekend day**
  - **No Saturday trigger.** Saturday remains a recovery day across Brief, Plan, and Nudges.
- Suppress when `evaluateWeekAheadMode(...).active === false` (covers travel + full working weekend), already-sent-today, or the user already hit `list-week-ahead-priorities` today.
- `deepLinkRoute: '/plan?mode=week-ahead'`.
- Copy: short, reason-aware ("Plan the week ahead", "Pick what matters next week — 2 min").

Unit tests: fires Sunday 17:00; fires 17:00 on `last_day_pto`; **suppressed on every Saturday**; suppressed Monday; suppressed on `fullWorkingWeekend === true`.

## 7. SSOT updates

`docs/GENERATE_MASTERY_PLAN_SSOT.md`:

- §17.1: remove Saturday from the Week-Ahead ladder; add a one-line cross-reference: "Saturday remains a self-regulation / recovery day across Brief, Plan, and Nudges — handled by the recovery driver in §17.2a, not by Week-Ahead Mode."
- §17.2: drop "(planned)" for `week_recap`. Add **§17.2a Saturday Recovery Driver** describing `week_recovery`: week-gone-by metrics + `weekendEvents[]` snippet; why-line may name a weekend meeting; forward weekday events forbidden.
- §17.3: rewrite scoring → **"`rankJitCandidates` (same as weekday Plan) + `applyEventPriorityMemory` learning loop; top 10 by score; per-category soft cap = 4; no per-day cap."**
- §17.5: drop "follow-up" wording; document `WEEK_AHEAD_MEMORY_BOOST`; note `cancel_feedback` is wired.
- §17.7: rewrite trigger → **Sunday 16:00–19:00 local OR 16:00–19:00 local on last-PTO / last-holiday / last-long-weekend**. Explicitly: no Saturday trigger.
- §17.8 suppression matrix: Saturday → "Suppressed — recovery day (Brief uses `week_recovery` driver, Plan runs weekday cadence)".

## Technical details

- Env: `WEEK_AHEAD_MEMORY_BOOST` (default `false`) on `compute-outer-readiness`, `generate-mastery-plan`, `list-week-ahead-priorities`. Flip to `true` after validating weekday Plan output is unchanged for users with zero memory rows.
- Auth/dev parity: every new fetch reuses `_shared/auth.ts` + the `x-dev-user-id` bypass — no client-side fork.
- Tests via `supabase--test_edge_functions`: `_shared/plan/week-ahead-mode`, `_shared/events/jit-candidates`, `_shared/plan/event-priority-memory`, `compute-outer-readiness`, `smart-nudges`, `list-week-ahead-priorities`.
- Risk: `rankJitCandidates` signature change could ripple. Mitigation: `memoryDelta`/`memoryHardDemote` stay optional and default to noop.
- Out of scope: MRS scoring, atomic-brief contract, signal-pill shape, any UI beyond the cancel-modal hook and the existing PlanPage week-ahead branch.
