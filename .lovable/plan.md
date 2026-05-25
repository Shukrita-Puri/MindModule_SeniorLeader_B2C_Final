
## Goal

Make the Today plan cancel flow work uniformly for all three priority slots — morning, evening, and JIT — with the same glass feedback modal and the same compressed/grey/strike-through cancelled state with Undo. Strip the thumbs up / neutral / down control out of the cancel feedback only.

## Findings (current state)

`src/components/home/TodayThreePriorities.tsx`

- Cancel button is only rendered for non-JIT expanded slots (line 1311: `{!hm.isJit && !slotCompleted && isExpanded && ...}`). JIT slots get a different `X` that calls `handleJitDismiss` (line 1302), which only fires the `track-jit-skip` snooze and never sets `isCancelled`. Result: JIT can't be cancelled with feedback, and never enters the compressed cancelled card.
- Non-JIT cancel already routes through `setPendingCancel` → `SlotCancelFeedbackModal` → `persistPlanLedgerEdit({ cancelled: true, cancelReason, replacementEventIds: [] })`. This part is correct.
- Cancelled rendering (lines 1163–1228) already shows: compressed card, grey + line-through title, "Cancelled" label, preserved ✓ when `slotCompleted`, Undo button that clears `cancelled`/`cancelReason`. Sort at lines 1060–1064 already pushes cancelled below active. These do not need to change.
- `useEffect` at 851–860 already skips cancelled slots when auto-expanding the next priority — works for JIT once `isCancelled` is set.

`src/components/home/SlotCancelFeedbackModal.tsx`

- Already uses glass styling matching `PlanFeedbackModal`.
- Still renders the thumbs row because it embeds `FeedbackCapture` with `hideRatingPrompt` (hides the label only) and a forced `rating="down"`. The three thumb icons still appear.

`src/components/feedback/FeedbackCapture.tsx` and `src/components/home/PlanFeedbackModal.tsx`

- Used in multiple other places (plan completion feedback). Must not change their public behavior.

## Changes

### 1. `src/components/home/TodayThreePriorities.tsx`

- Replace the JIT-only X button (lines 1302–1310) so that JIT slots use the same cancel-with-feedback entry point as non-JIT slots: open `SlotCancelFeedbackModal` via `setPendingCancel({ index, key: slotKey, title: ... })`. Drop the `handleJitDismiss` call from the slot UI.
- Collapse the two conditional X buttons into a single button rendered for every expanded, not-yet-completed slot (JIT or not). The cancel handler stays unchanged — it already persists `isCancelled: true` through `persistPlanLedgerEdit`, which works for JIT slots too.
- Leave `handleJitDismiss` defined (still referenced elsewhere if any) but remove its UI binding here. Verify there are no other call sites before deleting; if none, remove the function.
- No changes to the cancelled-card branch (1163–1228), the sort order (1060–1064), the auto-expand effect, plan generation, or persistence schema.

### 2. `src/components/home/SlotCancelFeedbackModal.tsx`

- Stop rendering the thumbs row. Two options; prefer the smaller one:
  - Inline a trimmed feedback block (reason buttons already exist locally) with just a `<Textarea>` + Submit/Skip buttons styled to match the existing glass look. Drop the `FeedbackCapture` import.
  - Keep the `rating="down"` analytics value passed to `onSubmit` via the existing `submitPlanSlotCancelFeedback` call path — that call already lives in `TodayThreePriorities.tsx` and does not depend on a user-visible rating. No analytics regression.
- Preserve: glass shell, "Cancel this priority?", reason buttons (`now` / `ever`), optional textarea, Submit ("Cancel priority") / Skip ("Keep it"), 300-char limit.

### 3. Files NOT modified

- `src/components/feedback/FeedbackCapture.tsx` — keep as-is (used by `PlanFeedbackModal` and others).
- `src/components/home/PlanFeedbackModal.tsx` — keep as-is.
- No edge function, no migration, no calendar sync, no shared classifier changes.

## QA checklist

- Expand a morning non-JIT priority → tap X → glass modal appears with reason buttons and textarea but no thumbs → submit → slot stays visible, greyed, struck through, with Undo.
- Expand an evening non-JIT priority → same flow works.
- Expand a JIT priority → tap X → same glass modal appears (not the silent snooze) → submit → JIT slot stays visible in compressed cancelled state.
- Tap Undo on a cancelled JIT slot → slot returns to its prior active/expanded state; if it was completed before cancel, the ✓ is preserved.
- Cancelled slots remain sorted below active ones; active priorities render exactly as before.
- Existing EngravedLoader and card shell are unchanged.
