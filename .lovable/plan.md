## Goal

Make every priority slot's title hold true to one of two contracts — never a generic literal:

1. **JIT-anchored** — slot is pinned to a specific calendar event (today or tomorrow). Label: `Prepare ahead of <Event Title>`.
2. **State-anchored bridged to calendar pressure** — slot uses physiological/cognitive state, but the title MUST reference the calendar context that makes the state matter (today's load, event pressure, or tomorrow's lead event). Label pattern: `<State action> ahead of <calendar anchor>`.

The rule "every slot tied to State or JIT" applies to **all three slots equally** — morning, afternoon, evening. Evening is not a special "Prepare for tomorrow" case; it follows the same contract.

## Root cause (re-confirmed)

- **Edge function** (`generate-mastery-plan/index.ts`): per-slot replacement override (lines ~2787–2793) silently skips when no fresh JIT module exists for the chosen event → slot keeps its generic state literal. Also, `slot2TimeLabel` / `slot3TimeLabel` fall back to bare strings (`'Midday reset'`, `'Later today'`, `'When you have space'`) that are decoupled from any calendar/state signal.
- **Client** (`TodayThreePriorities.tsx` lines 79–101): `performanceSlotLabel` substring-matches those bare strings into `'Prevent the afternoon dip'` / `'Prepare for tomorrow'` / `'Prepare for the day'` — generic literals with no anchor.

## Changes

### 1) `supabase/functions/generate-mastery-plan/index.ts`

**A. Per-slot replacement override — always anchor to the chosen event (around line 2787)**

Remove the early `continue` when no fresh JIT match is found. Instead, synthesize a JIT-shaped slot at `finalHorizonModules[idx]`:

- Keep `prior`'s practice content (`contentId`, `type`, `duration`, etc.).
- Force-set: `isJit = true`, `jitEventTitle = evt.title`, `timeLabel = "Prepare ahead of <evt.title>"`, `horizon` from minutes-until-event.
- Set `replacementEventIds: [eventId]`, clear `isCancelled` / `cancelReason`.
- Preserve `priorityTag` / `relationshipTag` / `customTags`.

Always overwrite `timeLabel` to `"Prepare ahead of <evt.title>"` (drop the `"<Event> · in X hrs"` and `"<Event> · today"` variants for replacements).

**B. State-anchored non-JIT labels — bridge state to calendar pressure (all three slots)**

Introduce a single helper `composeStateLabel(slotIndex, state, calendar)` used by `slot1TimeLabel`, `slot2TimeLabel`, `slot3TimeLabel` non-JIT branches:

Inputs: dominant state signal (HRV deficit, sleep deficit, sustained-load, post-peak hangover, depleted check-in), today's calendar load/density, today's remaining high-stakes event, tomorrow's lead event (using existing `selectLeadEvent` from `state-engines.ts`).

Output template:
```
<state action> ahead of <calendar anchor>
```

Where:
- **state action** is derived from the dominant signal:
  - HRV deficit → `Restore HRV`
  - Sleep deficit → `Recover sleep debt`
  - Sustained load → `Decompress`
  - Post-peak hangover → `Reset after yesterday's peak`
  - Cognitive fragmentation today → `Re-consolidate focus`
  - Self-declared depleted → `Settle the system`
- **calendar anchor** is the strongest available reference, in priority:
  1. Tomorrow's lead high-stakes event title → `tomorrow's <Event>`
  2. Tomorrow's load tier when heavy/crushing → `tomorrow's full day of <dominant pillar>` (e.g. "conference and speaking engagement", "back-to-back interviews", "long-haul travel")
  3. Today's remaining high-stakes event (for morning/afternoon slots) → `today's <Event>`
  4. Today's overall density → `today's dense calendar` / `today's back-to-back load`

Examples this must produce:
- `Restore HRV ahead of long-haul travel tomorrow`
- `Restore HRV ahead of tomorrow's board meeting`
- `Decompress ahead of tomorrow's full day of conference and speaking`
- `Reset after yesterday's peak ahead of today's investor call`

**C. Forbid bare-time literals as final labels**

Remove these from being emitted as final `timeLabel`s: `'Midday reset'`, `'Later today'`, `'When you have space'`, `'This evening'`, `'Before bed'`, `'For your development'`, `'When ready'`, `'Prepare for the day'`, `'Prepare for tomorrow'`. They may remain as internal scheduling hints but never reach the client unchanged.

Last-resort fallback (no state signal AND no calendar anchor): `Build capacity for tomorrow's load` (slot 3) or `Steady the system through today's load` (slots 1–2) — still references calendar context, never bare.

**D. MVP scope guard**

Out-of-scope for MVP (per user): material event prep (briefing prep, deck review, talking points). The non-JIT contract is strictly Self-Regulation framing — state restoration anchored to calendar pressure, not content prep for the event itself.

### 2) `src/components/home/TodayThreePriorities.tsx`

`performanceSlotLabel` (lines 79–101) becomes a thin pass-through:

- JIT branch: keep `^Before ` → `Prepare ahead of ` rewrite.
- Non-JIT branch: **return `raw` verbatim**. Delete the three substring mappers (`'Prevent the afternoon dip'`, `'Prepare for tomorrow'`, `'Prepare for the day'`).

Server is the single source of truth.

### 3) Validation

- Cancel slot 2 → pick "Board meeting" → slot 2 renders `Prepare ahead of Board meeting`.
- Slot 3 with HRV deficit + tomorrow has board call → `Restore HRV ahead of tomorrow's board call`.
- Slot 3 with HRV deficit + tomorrow has long-haul flight → `Restore HRV ahead of long-haul travel tomorrow`.
- Slot 3 with sustained load + tomorrow heavy with speaking → `Decompress ahead of tomorrow's full day of conference and speaking`.
- Slot 2 with cognitive fragmentation + investor call later → `Re-consolidate focus ahead of today's investor call`.
- No bare `Prevent the afternoon dip` / `Prepare for tomorrow` / `Prepare for the day` strings ever reach the UI.
- Cancelled slots remain in-place; only the cancelled slot mutates on apply.

## Files

- `supabase/functions/generate-mastery-plan/index.ts` — override synthesis + forced `Prepare ahead of` framing + new `composeStateLabel` helper applied to all 3 non-JIT slot label branches.
- `src/components/home/TodayThreePriorities.tsx` — strip client-side generic mappers in `performanceSlotLabel`.
