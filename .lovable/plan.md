# Week Ahead — Save/Submit Confirmation Flow (UI only)

## Current state (verified)

- `src/components/home/WeekAheadPriorities.tsx` already writes every Star / Cancel / Never click immediately to `event_priority_memory` (source `week_ahead_picker`) via the `record-event-priority-signal` edge function. Optimistic UI, rollback on failure.
- On reload, the server returns `priorSignal` per event and the component rehydrates selections — persistence already works end-to-end.
- Plan generation consumes `event_priority_memory` through `loadPriorityMemoryForUser` in the JIT ranking pipeline (verified previously).
- The bottom-right **Refresh** button only re-invokes `list-week-ahead-priorities`. It doesn't save anything (saves already happened per-click) — its presence is the source of user confusion.

Conclusion: no backend, no schema, no logic changes required. This is purely a UX affordance so the user gets an explicit "done" moment and clear confirmation.

## Scope of change

Single file: `src/components/home/WeekAheadPriorities.tsx`.

### 1. Replace the footer row

Remove the current footer:

```text
Your choices teach the system what matters.        [Refresh]
```

Replace with a sticky-ish primary CTA block:

```text
[  Save Week Ahead Priorities  ]
Your preferences will shape your upcoming plan.
```

- Primary `Button` (default variant), full width on mobile, right-aligned inline on md+.
- Disabled when `Object.keys(decisions).length === 0` with helper text: "Mark at least one event to save."
- Refresh is dropped from the primary UI (writes are already immediate; a manual reload isn't part of the user's mental model). Pull-to-refresh / route revisit still works.

### 2. Save behaviour

Because per-click writes already persist, Save is a **confirmation gesture**, not a new write path. On click:

1. If any selection is still mid-flight (`submitting` non-empty), await it — show inline spinner "Saving your choices…".
2. Once all in-flight writes settle:
   - Success → set `saved = true`, show a green inline confirmation banner (replaces the CTA block):

     ```text
     ✅ Your Week Ahead priorities have been recorded.
     They'll be used when building your upcoming plan.
     ```

     Plus a `toast.success("Week Ahead priorities saved")`.
   - Any per-item write failed (tracked via a new `failedIds` set populated inside the existing catch in `recordSignal`) → show destructive inline message: "We couldn't save your Week Ahead priorities. Please try again." with a retry button that re-fires the failed signals only.
3. After `saved = true`, still allow further edits — any new selection resets `saved` back to `false` so the user can Save again.

### 3. Selection state after save

Nothing changes visually per row — the existing ring / opacity / line-through treatments already communicate the saved decision, and rehydration on reload already works. The banner is the "receipt".

## Out of scope (explicit)

- No changes to `record-event-priority-signal`, `list-week-ahead-priorities`, `event_priority_memory`, or plan generation.
- No batching / deferred write mode — per-click writes stay so a user who navigates away without hitting Save still gets their choices honoured (matches current shipped behaviour and how Plan already consumes the data).
- No new table, no migration, no edge function redeploy.

## Technical notes

- Add local state: `saved: boolean`, `failedIds: Set<string>`.
- Extend `recordSignal` catch block to add `item.eventId` to `failedIds` (instead of only rolling back), and clear it on the next successful retry.
- Reset `saved` to `false` at the top of `recordSignal` so subsequent edits require re-confirmation.
- Confirmation banner uses existing design tokens (`bg-primary/10 text-primary` for success, `text-destructive` for error) — no new CSS.
- Copy strings live inline in the component; no i18n plumbing exists here today.

## Validation

- Run `bunx vitest run src/components/home/__tests__/WeekAheadPriorities.test.tsx` — existing 4 tests (populated, empty, missing fields, error) must still pass. Add one new test: clicking Save after a selection shows the confirmation banner.
- Manual smoke: mark 1 Star + 1 Cancel + 1 Never → Save → banner appears → reload page → selections rehydrate, banner is gone (fresh session), decisions visible on rows.
- No backend tests to run — no backend code changed.

## Deliverable

Updated `WeekAheadPriorities.tsx` + one added test case. No other files touched.
