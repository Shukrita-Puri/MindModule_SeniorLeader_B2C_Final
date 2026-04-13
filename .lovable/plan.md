

# Fix Today's 3 Performance Priorities — Context Chain, Deduplication, Time Bugs, and Multi-Practice Sequences

## Summary

The Performance Readiness Brief now operates as "Chief of Staff for the Mind" — but the Priorities card below it feels disconnected. Beta testers report: generic context, time hallucinations, JIT duplication, and single-practice-per-slot limitations. The core issue is the Priorities don't inherit the Brief's intelligence. This plan fixes all six reported issues while keeping the 1-2-3 slot layout unchanged.

## What Changes

### Edge Function: `supabase/functions/generate-mastery-plan/index.ts`

#### 1. New function: `buildSlotContext()` — replaces `buildWhyLine()`

The current `buildWhyLine()` is a flat cascade of descriptive strings. Replace it with `buildSlotContext()` that produces a structured object:

```typescript
interface SlotContext {
  situation: string;   // What the Brief already identified (pattern/risk)
  whyLine: string;     // 1-sentence causal statement for the slot
  sequenceLogic?: string; // Why these practices in this order (multi-practice only)
}
```

**Key design principle**: Every `whyLine` must answer "Because X → we do A → so that Y doesn't happen." Not "Clarity is low" but "Your HRV has dropped before every board session — settle your system before that pattern takes over."

**Signal priority** (same as Brief — relay race):
1. HRV event correlation (strongest — physiological pattern memory)
2. Divergence mode (MASKED_HIGH — body vs mind split)
3. Coach insight / pending commitment (behavioral pattern)
4. Consecutive state pattern (3+ days)
5. Calendar load + time-of-day
6. Archetype watch-for
7. Generic fallback (never uses hardcoded time words)

**Time-of-day awareness**: All copy derives time from the `timeOfDay` parameter. Never hardcode "this morning" — use `timeOfDay === 'morning' ? 'before the day starts' : timeOfDay === 'afternoon' ? 'before the afternoon compounds' : 'before you close the day'`.

**Immediate horizon examples**:
- HRV correlation + JIT: `"Your HRV drops avg {X}% before {eventType} — ground your nervous system before that pattern takes over."`
- MASKED_HIGH + calendar: `"Your body is carrying load you haven't registered — {meetingCount} meetings will compound it unless you settle now."`
- Coach growth area + depleted: `"Your coach flagged {growthArea} — address your state first so that pattern doesn't drive your thinking."`
- Depleted + no specific signal: `"Reserves low with {meetingCount} meetings ahead — regulate before the day demands what you don't have."`

**Tactical horizon examples**:
- JIT + HRV: `"Your HRV typically drops before {eventType} — this sequence grounds your state then sharpens your focus for it."`
- Pending commitment: `"Your coach commitment: '{commitment}' — this practice directly addresses it while your calendar allows."`
- Pattern insight (3+ days): `"{count} {state} days running — this interrupts the pattern before it becomes your baseline."`

**Strategic horizon examples** (never generic):
- Pending commitment: `"You committed to '{commitment}' — your calendar has space to build that capacity now."`
- Coach growth area: `"Your coach identified {growthArea} — this builds it while your system isn't under strain."`
- Archetype watch-for: `"Your pattern: {watchFor}. Today has space to address it deliberately."`
- Evening + depleted: `"Depleted day — restore before tomorrow inherits what today carried."`
- Evening + strong: `"Strong day — close with intention before tomorrow's demands arrive."`
- Final fallback: `"For your development — when your system has capacity."` (not "For who you're building toward")

#### 2. JIT event deduplication guard

In `buildHorizonModules()`, after slot 1 consumes a JIT event (`slot1IsJit = true`):
- Set `jitConsumedEventId = jitEventTitle`
- Slot 2's JIT checks (lines 2922-2933) add `&& !slot1IsJit` guard
- This prevents the same "Day Block - Prepare" event appearing in both slots

#### 3. Multi-practice per priority slot

**Backend** — extend `HorizonModule`:
```typescript
interface HorizonModule {
  // ... existing fields ...
  practice: any;           // kept for backward compat (= practices[0])
  practices: any[];        // NEW: 1-3 practices per slot
  sequenceReasoning?: string; // NEW: why these practices together in this order
}
```

Slot population logic:
- **Slot 1 (Immediate)**: When JIT, include all `preEventPlan.modules` (up to 3). When non-JIT + depleted, include regulate + first align. Otherwise, include first todModule + next if available (max 2).
- **Slot 2 (Tactical)**: Include 1-2 modules from remaining todModules pool (skip used IDs).
- **Slot 3 (Strategic)**: Include coach card + next remaining practice if available (1-2 max).

Each practice keeps its own `reasoning` string from `getContextualReasoning()`.

**Sequence reasoning** (per slot, not per practice): Explains the causal chain. Example: `"Settle your nervous system first (regulate), then shift how you hold the pressure (reframe) — so the board pattern doesn't drive your decisions."`

#### 4. Pass Brief signals into plan context

The `outerReadinessCache` already flows into `buildSharedContext()`. Extract from it:
- `phrase` (the Brief's pattern-linked directive)
- `bodyText` (the Brief's cognitive risk statement)
- `leanOn` / `watchFor` arrays

Make these available in `buildHorizonModules()` so `buildSlotContext()` can reference what the Brief already surfaced — completing the relay race from Brief → Priorities.

### Frontend: `src/components/home/TodayThreePriorities.tsx`

#### 1. Multi-practice rendering (horizontal scroll within expanded slot)

**Recommendation: horizontal scroll** — each practice card stays the same design but at ~75% width, scrollable left-to-right within the expanded slot area. This preserves the vertical 1-2-3 layout while allowing 2-3 practices per slot.

- Update `HorizonModule` interface: add `practices?: PlanModule[]` and `sequenceReasoning?: string`
- In expanded slot, render `sequenceReasoning` above the practice cards (same style as current `whyLine` but non-italic, slightly bolder)
- Render practices via `hm.practices || [hm.practice]` in a horizontal `ScrollArea` with `overflow-x-auto flex gap-2`
- Each practice card: same design, same height (h-40), but width shrinks to `w-[75%] flex-shrink-0` when multiple practices exist (full width when single)
- Each practice card shows its own `reasoning` as a small text line inside the card
- The "Start" button navigates to the first uncompleted practice in the sequence and queues the rest

#### 2. Completion tracking for multi-practice

- `allPractices` flattens all `practices` arrays across all slots
- `completedCount` checks all practices across all slots
- A slot's number circle turns green only when all practices in that slot are completed
- Collapsed slot shows first practice title + "(1 of 2)" or "(2 of 3)" indicator

#### 3. WhyLine and sequenceReasoning display

- Collapsed: show `whyLine` (truncated, as today)
- Expanded: show `sequenceReasoning` (if multi-practice) above the scroll area, then `whyLine` below the sequence reasoning
- Each practice card shows its individual `reasoning` inside the card body

## What Does NOT Change

- The 1-2-3 vertical slot layout
- Performance Readiness Brief card
- Signal pills, score row, calendar pills
- `compute-outer-readiness` edge function
- Navigation routing and player logic
- Completion tracking to `daily_ritual_completions`
- JIT polling interval and snooze/dismiss protocol

## Technical Notes

- `buildWhyLine` currently has 22 parameters — `buildSlotContext` will take a single context object to reduce parameter sprawl
- HRV correlations, coach data, archetype, pending commitments are already available in `buildHorizonModules` — just need better synthesis
- Content dedup (lines 3001-3009) needs to deduplicate across all `practices[]` arrays, not just `practice`
- The `practiceQueue` localStorage logic needs to queue all practices from a slot, not just one

