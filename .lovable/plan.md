I found the likely root cause: cancel submit currently waits for the feedback write first, then persists the plan edit, then force-refreshes/regenerates the plan. If the feedback/backend call is slow, the modal appears frozen for a long time and the local UI never gets an immediate cancelled state. Also, the cancelled state is only visible after the regenerated plan comes back with `isCancelled`, so any slow generation path delays grey/strikethrough + Undo.

Plan:

1. Make cancel optimistic and instant in `TodayThreePriorities.tsx`
   - On “Cancel priority”, immediately update local `plan.horizonModules[pendingCancel.index]` with:
     - `isCancelled: true`
     - `cancelReason`
     - `replacementEventIds: []`
   - Close the modal immediately so the compressed cancelled card + Undo appears right away.
   - Persist the ledger edit in the background via `persistPlanLedgerEdit`.
   - Submit cancellation feedback in parallel/background so it cannot block the UI.
   - If ledger persistence fails, roll the local slot back and show the existing destructive toast.
   - Preserve priority/relationship tags by not passing them in the cancel patch.

2. Make Undo instant too
   - On Undo, immediately set `isCancelled: false` and clear `cancelReason` locally so the prior slot returns immediately.
   - Persist the uncancel edit in the background.
   - If persistence fails, roll back to cancelled and show the existing toast.
   - Do not trigger slow force regeneration for simple cancel/uncancel.

3. Keep cache consistent without regenerating
   - Update the existing persistent plan cache when cancel/uncancel succeeds so refresh retains the current visible state while the DB ledger remains canonical.

4. Improve glass feedback readability
   - In `SlotCancelFeedbackModal.tsx`, make “Not relevant now” and “Not relevant ever” labels white, with more readable hint text.
   - Increase modal glass contrast/readability without redesigning the UI.
   - In shared `FeedbackCapture.tsx` and `PlanFeedbackModal.tsx`, adjust glass variant text, placeholders, borders, and button text contrast so all glass feedback modals are legible.

5. Validate after implementation
   - Run targeted static checks/searches for the cancel path.
   - Verify the modal no longer blocks on feedback before local cancellation state is shown.
   - Confirm cancelled slots render grey/strikethrough with Undo and tags preserved.