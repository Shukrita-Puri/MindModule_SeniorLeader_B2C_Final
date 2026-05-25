I’ll fix this as one end-to-end replacement flow, without changing the core “one daily plan with 3 priorities, evolve unfinished slots, bonus round only after all 3 are complete” rule.

Plan:

1. Persist replacements as real active slots
- Update the client replacement apply path so selecting calendar events writes a local mirror immediately, not only the backend ledger.
- The mirror will store `cancelled: false`, `cancelReason: null`, and `replacementEventIds` so a browser refresh cannot rehydrate the old cancelled/greyed state while the backend response catches up.
- When the regenerated plan returns, cache the regenerated active plan and keep it as the rendered plan after refresh.

2. Fix ledger merge so replaced priorities do not stay cancelled
- In the plan Edge Function, treat a slot with `replacementEventIds` and `cancelled: false` as an active replaced slot.
- When merging with the daily ledger, preserve the replacement selection and use the newly selected event context for that slot, instead of falling back to the original recommended priority.
- Avoid applying stale `isCancelled` values from old ledger modules over a newer user edit that explicitly says `cancelled: false`.

3. Filter previous/passed events consistently
- Move the “remaining events only” rule into the shared calendar rules file used by both UI and backend.
- Apply it to the replacement picker before grouping Today/Tomorrow, for all three priorities.
- Also apply the same rule inside `list-replacement-calendar-events` so passed events are removed before the UI ever receives them.
- Keep today + tomorrow only; no day/period toggle.

4. Keep the existing daily-plan rule intact
- Do not change the overall plan lifecycle: the user still sees one 3-priority plan for the day, unfinished priorities evolve with new brief context, completed priorities stay done, and a fresh new set only appears after all 3 are complete.
- The only exception remains replacement: if the user cancels/replaces a priority, that slot becomes the updated/replaced plan slot and should not revert to the original recommendation.

5. Validate the path
- Verify code paths for: cancel → replace → apply → regenerated plan → refresh.
- Confirm picker results exclude ended events for every slot.
- Confirm replaced slots render active, not greyed/cancelled, immediately and after refresh.