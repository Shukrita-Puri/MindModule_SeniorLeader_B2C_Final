## Goal

Close the two known gaps from the last validation pass:

1. **Broaden the learning loop** — `event_priority_memory` currently learns only from cancel-feedback + Week-Ahead picker tags. Extend it so post-plan-completion feedback (thumbs up/down on a JIT-bound priority) also writes a signal, and the per-event tags users set in prior Week-Ahead sessions visibly influence the next ranking.
2. **Wire the Week-Ahead picker-invite nudge** — the `shouldFireWeekAheadPickerInvite` predicate is tested and shipped but `smart-nudges/index.ts` never calls it. Add a dedicated evaluator so it actually emits a push on Sun 16:00–19:00 local and last-day-PTO/holiday/long-weekend evenings.

No SSOT taxonomy changes; no schema migrations beyond extending the existing `signal`/`source` CHECK constraints on `event_priority_memory`.

## Learning loop — what each producer contributes after this change

| Producer | Trigger | Signal written | Decay | Score effect |
|---|---|---|---|---|
| Week-Ahead picker (existing) | User taps Priority / Not this week / Never | `priority` / `not_this_week` / `never` | 60d / 14d / hard | +10 / −15 / hard demote |
| Cancel-feedback bridge (existing) | "Not relevant now / ever" on a JIT slot | `cancelled_keep_surfacing` / `cancelled_as_noise` | 60d / 60d | +5 / −25 |
| **Post-plan thumbs-up bridge (new)** | Thumbs-up in `PlanFeedbackModal` for a JIT-bound priority | `priority` with `source='post_plan_feedback'` | 60d | +10 |
| **Post-plan thumbs-down bridge (new)** | Thumbs-down on a JIT-bound priority **only when** free-text says the event itself was wrong (heuristic: contains "wrong event", "not relevant", "doesn't apply") | `cancelled_as_noise` with `source='post_plan_feedback'` | 60d | −25 |
| Thumbs-down with no event-targeted text | — | **no write** (feedback is about the practice, not the event — routed to content feedback only) | — | — |

Neutral and any non-JIT plan feedback never write to event memory.

## Implementation

### 1. Extend `event_priority_memory` allowed sources

Single migration:

```sql
ALTER TABLE public.event_priority_memory
  DROP CONSTRAINT event_priority_memory_source_chk,
  ADD CONSTRAINT event_priority_memory_source_chk
    CHECK (source IN ('week_ahead_picker','priority_tag','cancel_feedback','post_plan_feedback'));
```

No new signal values — `priority` / `cancelled_as_noise` already exist.

### 2. `record-event-priority-signal` — allow the new source

Add `'post_plan_feedback'` to `VALID_SOURCES`. Everything else (Auth, body shape, `coarseEventType` + `normalizeEventTypeKey` derivation, RLS/service-role insert) is unchanged.

### 3. Post-plan thumbs-up/down bridge in `TodayThreePriorities`

In the `PlanFeedbackModal.onSubmit` handler at line 1730:

- Look up the slot the modal fired for (`feedbackSlot.index`) and read its `eventTitle` (same field used by the cancel bridge at line 1810).
- If `eventTitle` exists:
  - **rating = 5 (thumbs-up)** → fire-and-forget POST to `record-event-priority-signal` with `signal='priority'`, `source='post_plan_feedback'`, `meta: { rating, feedbackText, slotTitle }`.
  - **rating = 1 (thumbs-down)** AND `feedback` matches `/wrong event|not relevant|doesn't apply|don't need/i` → POST `signal='cancelled_as_noise'`, `source='post_plan_feedback'`.
  - Otherwise → no event-memory write (already covered by `submitPlanFeedback` content-feedback path).
- If `eventTitle` is null (state-anchored slot, no JIT event) → no write.

Pure side-effect, mirrors the cancel-feedback pattern at lines 1810–1830. No UI change.

### 4. Surface "what the system learned" in the Week-Ahead picker

`list-week-ahead-priorities` already collapses `applyEventPriorityMemory.reasons[]` into `scoreReasons[]` (lines 271–296). Confirm `WeekAheadPriorities.tsx` renders those reasons under each card so the user can see e.g. *"prior priority ×2"* or *"previously paused but kept"*. If the chip already shows score reasons we just verify; otherwise add a single-line subtle text under the title. (Read-only verification first — only edit if missing.)

### 5. Wire the `weekAheadPickerInvite` evaluator into `smart-nudges/index.ts`

New evaluator alongside `evaluateNudgeOne/Two/Three`:

```ts
async function evaluateWeekAheadPickerInvite(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  todayLogs: { notification_type: string }[],
  supabase,
): Promise<QualifiedNudge | null>
```

Logic:
- Skip if `alreadySentTypes.has('week_ahead_picker_invite')`.
- Compute today's `weekAheadDecision = evaluateWeekAheadMode({ dayOfWeek, localHour, manualOverride: false })` using the user's local TZ already on `ctx`.
- `pickerOpenedToday` — query `behavior_logs` (or a lightweight existing signal) for an event marking the user opened `/plan?mode=week-ahead` today. If no such log exists yet, add a single client-side `supabase.from('behavior_logs').insert({...})` write on `WeekAheadPriorities` mount keyed `event_type='week_ahead_picker_opened'`. (Tiny addition — already-existing table, RLS already allows the auth user to insert their own row.)
- `alreadySentToday` — true if any row in `todayLogs` has `notification_type = 'week_ahead_picker_invite'`.
- Call `shouldFireWeekAheadPickerInvite({ dayOfWeek, localHour, weekAheadDecision, alreadySentToday, pickerOpenedToday })`.
- If `fire === true`, return a `QualifiedNudge` with:
  - `type: 'week_ahead_picker_invite'`
  - `slot: 'evening'` (16–19 falls inside the project-wide evening slot used by Nudge 3)
  - `anchorKind: 'state'`, `signalStrength: 2`, `priority: 25` (sits just above generic state nudges but below Nudge 1 JIT)
  - `deepLinkRoute: '/plan?mode=week-ahead'`
  - `copy`: short static variants — e.g. *"Sunday reset. Pick this week's 10 priorities — 90 seconds."*; for last-day-PTO/holiday/long-weekend, the reason-aware variant *"Last day off. Pick this week's 10 priorities before tomorrow lands."*

Wiring in the runner main loop (around line 3270, after Nudge 3 evaluation, gated on user notification prefs):

```ts
if ((prefs?.evening_close_enabled ?? true)) {
  const inv = await evaluateWeekAheadPickerInvite(ctx, alreadySentTypes, todayLogs, supabase);
  if (inv) qualified.push(inv);
}
```

Tie-break: the existing comparator (slot rank → anchor → signalStrength → priority) keeps a real JIT evening Nudge 3 ahead of the picker invite, which is what we want.

Telemetry: log `[smart-nudges] week_ahead_picker_invite fire=… reason=…` to mirror Nudge 1/2/3 lines.

### 6. Tests

- `_shared/plan/week-ahead-nudge.test.ts` — already covers the predicate; no new tests needed there.
- `_shared/plan/event-priority-memory.test.ts` — add a case: a single `priority` signal from `source='post_plan_feedback'` produces `+10` and reason `"prior priority ×1"` (no logic change, just confirms the new source is read identically).
- New `record-event-priority-signal/index.test.ts` is out of scope (HTTP test infra); rely on the existing edge function tests + manual curl via `supabase--test_edge_functions` if needed.
- Manual: trigger the smart-nudges runner against a dev user with Sun-local-17:00 simulation and assert `qualified` contains `week_ahead_picker_invite` with deep link `/plan?mode=week-ahead`.

### 7. SSOT update

`docs/GENERATE_MASTERY_PLAN_SSOT.md`:
- §17.4 — add `post_plan_feedback` to the source enum + map to the same `priority` / `cancelled_as_noise` signals; document the thumbs-down free-text heuristic.
- §17.7 — drop "(runner wiring pending)" once the evaluator is in. Add a one-line note on the static copy variants and the `behavior_logs` `week_ahead_picker_opened` event used for the `pickerOpenedToday` check.

## Files touched

```text
supabase/migrations/<ts>_event_priority_memory_post_plan_source.sql   # add post_plan_feedback to source check
supabase/functions/record-event-priority-signal/index.ts              # widen VALID_SOURCES
supabase/functions/_shared/plan/event-priority-memory.test.ts         # add post_plan_feedback case
supabase/functions/smart-nudges/index.ts                              # new evaluator + wiring + copy variants
src/components/home/TodayThreePriorities.tsx                          # post-plan thumbs-up/down bridge in PlanFeedbackModal onSubmit
src/components/home/WeekAheadPriorities.tsx                           # one-off behavior_logs write on mount + verify scoreReasons render
docs/GENERATE_MASTERY_PLAN_SSOT.md                                    # §17.4 + §17.7 updates
```

Estimated diff: ~250 lines, no behaviour change for users who never see the picker or post-plan feedback.

## Question for you before I build

You mentioned learning from *"importance and **relationship** done for previous plans"*. The current memory is keyed by `(event_category, event_type_key)` — it does **not** track per-attendee or per-relationship signals. Two options:

- **A. Ship as planned above** — event-type + category learning only. Relationship-level memory deferred. This is what the plan above does.
- **B. Add attendee-relationship memory now** — would mean a new `event_priority_memory.attendee_key` column (or sibling `attendee_priority_memory` table), wiring it through the ranker, and capturing the dominant attendee from `attendee_relationships` at signal-write time. Roughly doubles the diff.

If you want B, say the word and I'll fold it into the plan before building.