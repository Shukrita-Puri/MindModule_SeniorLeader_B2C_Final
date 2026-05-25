## Objective
Fix the Today’s Plan replacement flow so a cancelled priority only gets replaced inside the exact slot the user acted on, and tighten the slot-generation/modeling so the 3-slot plan stays performance-led (Prepare / Prevent) rather than drifting into generic wellness framing.

## What I’ll change

### 1) Remove the remaining cross-slot replacement path in the client
In `src/components/home/TodayThreePriorities.tsx`:
- Replace the current regeneration call that still sends `selectedCalendarEventIds` with a slot-scoped payload.
- Update `loadPlan(...)` to accept a new shape:
  - `slotReplacements?: Record<number, { eventId: string }>`
- Stop using the flat selected-event array in the replacement flow entirely.
- Keep the existing optimistic update, local mirror patch, and ledger persistence, but ensure they are all scoped only to `replacementSlot.index`.
- Preserve cancelled slots in-place visually and never trigger reordering.

Why this matters: I confirmed the current client still calls `loadPlan({ ..., selectedCalendarEventIds })`, which lets the server boost/re-rank the chosen event globally and causes it to land in Slot 1.

### 2) Make the edge function honor per-slot anchoring first-class
In `supabase/functions/generate-mastery-plan/index.ts`:
- Extend the request contract with:
  - `slotReplacements?: Record<string, { eventId: string }>`
- Use per-slot replacements as the preferred path during generation and merge.
- Ensure the selected event is only matched against the requested slot index and never used as a general ranking boost for the whole plan.
- Preserve backward compatibility with legacy `selectedCalendarEventIds`, but isolate it as a fallback path only.
- Keep the existing invariant of exactly 3 slots.

### 3) Audit and tighten stateful merge logic
In `supabase/functions/generate-mastery-plan/index.ts`:
- Verify the ledger evolution order is:
  1. completed slots stay sticky
  2. JIT anchor stays sticky when still valid
  3. explicit per-slot replacement anchors that exact slot
  4. non-cancelled untouched slots remain verbatim
  5. only the cancelled/unfilled slot recomputes
- Ensure a replacement on Slot 2 or Slot 3 can never consume the highest-ranked fresh slot and accidentally map it into Slot 1.
- Confirm cancelled slots remain in their original position after recompute.

### 4) Align slot framing with the intended performance model
In `supabase/functions/generate-mastery-plan/index.ts` and `src/components/home/TodayThreePriorities.tsx`:
- Audit slot labels and slot-purpose handling so each of the 3 slots remains explicitly tied to either:
  - state-driven performance support, or
  - JIT/prep around near-term events (today or next day where relevant)
- Keep the visible framing in Prevent / Prepare language only.
- Remove any remaining UI/server label behavior that reads as generic wellness when the slot is actually about CEO performance readiness.
- Keep the collapsed card structure as requested: title, tag, why-this-matters context, then expand for practice details.

## Validation I’ll run after implementation
- Cancel Slot 2 → replace with Event B → only Slot 2 changes; Slot 1 and Slot 3 remain untouched.
- Cancel Slot 3 → replace with Event C → only Slot 3 changes.
- Cancel Slot 2 and Slot 3 in sequence → each replacement stays bound to its own slot.
- Refresh after each replacement → replaced slot remains restored and anchored correctly.
- Cancelled slots remain in the same visual position.
- Labels across Morning / Afternoon / Evening and JIT replacements stay performance-led with Prevent / Prepare wording.

## Technical notes
- Root cause found: `TodayThreePriorities.tsx` still passes `selectedCalendarEventIds` into `loadPlan`, and the edge function still boosts globally based on that flat array.
- The fix is to switch the replacement flow to a slot-indexed contract end-to-end and keep legacy selected-event handling only as a fallback path, not the primary replacement mechanism.