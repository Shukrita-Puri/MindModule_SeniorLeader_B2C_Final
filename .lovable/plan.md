## Goal

Make calendar-event replacement strictly 1:1 with the cancelled slot the user clicked. No multi-select, no cross-slot bleed, always exactly 3 priorities in the plan.

## Problems today

1. The picker allows 1–3 events per priority. Users can select multiple, which contradicts the "1 event = 1 priority slot, 3 total" rule.
2. When multiple slots are cancelled and replacements are chosen, regeneration fills slots in order (Slot 1, Slot 2) instead of the specific cancelled slots (e.g. Slot 2 + Slot 3). Replacements leak into non-cancelled slots.

## Fix

### 1. Picker becomes single-select (per slot)

`src/components/home/CalendarReplacementPickerModal.tsx`
- Replace multi-toggle behaviour with single-select radio semantics: tapping an event sets it as the only selection; tapping again deselects.
- Drop "up to 3 events" / "X/3 selected" copy. Replace with "Pick 1 event to replace this priority".
- Apply button label: `Apply` (no count). Disabled until exactly 1 chosen.
- Keep today/tomorrow grouping and the past-event filter as-is.

### 2. Replacement is scoped to the exact cancelled slot

`src/components/home/TodayThreePriorities.tsx`
- On Apply, write the single selected event id to that specific slot's ledger edit only:
  - `patchPlanSlotEdit(slotIndex, { cancelled: false, replacementEventIds: [eventId] })`
  - `persistPlanLedgerEdit(slotIndex, { cancelled: false, replacementEventIds: [eventId] })`
- When calling `loadPlan({ forceRefresh: true })`, pass a per-slot replacement map (not a flat `selectedCalendarEventIds` array). Shape:
  ```
  slotReplacements: { [slotIndex: number]: { eventId: string } }
  ```
- Stop passing the flat `selectedCalendarEventIds` for the replacement flow; that array is what causes the edge function to re-anchor slots in index order rather than at the cancelled position.

### 3. Edge function honours per-slot anchoring

`supabase/functions/generate-mastery-plan/index.ts`
- Accept new optional input `slotReplacements: Record<string, { eventId: string }>` alongside (and preferred over) `selectedCalendarEventIds`.
- During plan assembly:
  - For every slot index `i` in `slotReplacements`, anchor slot `i` to that event and mark its ledger entry `cancelled: false, replacementEventIds: [eventId]`.
  - Leave all other slots untouched — never overwrite a non-cancelled slot, never shift a cancelled slot's replacement into a different index.
- Keep backwards compatibility: if only `selectedCalendarEventIds` is provided (legacy), fall back to today's behaviour but log a deprecation note.
- Always return exactly 3 priorities (existing invariant — verify the merge path still produces 3 when 1 or 2 slots are replaced and the others are untouched).

### 4. Local mirror + cache stay consistent

- `applyPlanEditsToModules` already merges per-slot edits — no change needed, because we are now writing per-slot.
- After Apply, optimistic `setPlan` updates only the targeted slot (clear `isCancelled`, set `replacementEventIds: [eventId]`); other slots untouched.
- `persistentBriefCache` write reflects the same per-slot update so refresh hydrates the correct slots.

## Out of scope

- No change to the cancel/undo flow, the past-event filter, or the daily-plan lifecycle (1 plan/day, bonus round after all 3 done).
- No UI change to non-replacement parts of `TodayThreePriorities`.

## Files touched

- `src/components/home/CalendarReplacementPickerModal.tsx` — single-select UI + copy
- `src/components/home/TodayThreePriorities.tsx` — per-slot apply + per-slot regen payload
- `supabase/functions/generate-mastery-plan/index.ts` — accept `slotReplacements`, anchor by index
- (No DB migration; ledger shape unchanged — `replacementEventIds` simply becomes a length-1 array.)

## Validation

1. Cancel Slot 2 only → pick event A → Slot 2 anchors to A; Slots 1 & 3 unchanged.
2. Cancel Slots 2 & 3 → open Slot 2 picker → choose B → only Slot 2 changes. Open Slot 3 picker → choose C → only Slot 3 changes. Slot 1 untouched throughout.
3. Refresh after each Apply → replaced slot stays anchored to the chosen event (not greyed, not reverted).
4. Picker shows only future-or-current events for today + all tomorrow events.
