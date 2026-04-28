---
name: Stateful Plan Evolution
description: Today's 3 Priorities evolve across check-ins instead of resetting; sticky completion, JIT anchors with adaptive practices, and bonus-round when all done.
type: feature
---
The day's plan is a persistent ledger keyed by `(user_id, ritual_date)`,
stored in `daily_ritual_completions.plan_ledger` (JSONB, service-role write
only via trigger guard). Each `generate-mastery-plan` call:

1. Reads the EARLIEST same-day ledger row.
2. Unions `completed_practice_ids` across ALL today's session_period rows.
3. Merges fresh-derived horizon slots with the ledger:
   - **Sticky completion**: slot whose primary practice is in the union stays verbatim with ✓ in its slotIndex.
   - **JIT anchor (adaptive)**: slot bound to a calendar event still on today's calendar keeps `slotIndex`, `jitEventTitle`, `horizon`, `isJit`. Practices, `whyLine`, `timeLabel` REFRESH from the matching fresh slot so a Board Meeting can shift from "Strategic Sharpness" (calm morning) to "Calm & Grounding" (overwhelmed afternoon) — same WHAT, different HOW.
   - **Otherwise**: recompute from fresh.
4. **Unfinished-business rule**: as long as ANY ledger slot is incomplete, the new plan evolves the ledger; never replaces it wholesale.
5. **Bonus Round**: when all 3 ledger slots are completed and a new brief is generated later that day, hand off to a brand-new plan and emit `ledger.victoryLine` (`"3/3 complete. Bonus priorities to keep momentum."`). Header label switches to "Today's 3 · Bonus Round".

Client (`TodayThreePriorities`):
- `checkCompletion` and cache-hydration paths use `getTodayCompletedUnion()` so morning ✓ persists into afternoon UI.
- Renders `plan.ledger.victoryLine` under the header in bonus-round mode.

Observability: `ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? }` returned in the plan response and logged server-side.

No schema reshape; one nullable `plan_ledger jsonb` column + before-INSERT/UPDATE triggers blocking client tampering.