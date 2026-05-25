## Pre-Phase-C fix — dedup slots + variable slot count (1–3)

### What's broken (from the screenshot)

All three priorities on the attached plan read "…ahead of tomorrow's Coca-Cola Client — Presentation". Two independent bugs in `supabase/functions/generate-mastery-plan/index.ts`:

1. **State-anchor duplication.** `composeStateLabel(slotIndex)` (lines 3901–3991) re-derives its anchor from `tomorrowLeadEvent` / `todayLeadEvent` every call. When the JIT path doesn't fire (event > 120 min away), all three slots stamp the same calendar title.
2. **Forced 3-slot fill.** The resolver always emits 3 slots, even when there is genuinely only one or two meaningful priorities for the user's current window. Combined with bug 1, this manufactures padding slots that reuse the same anchor event.
3. **No category-aware fan-out rule.** Per §4, only multi-phase categories (G Travel, F Conferences multi-day, A high-stakes with both pre+post in horizon, D pre+post same day) should ever take more than one slot for the same event. C/E/B/H must occupy at most one slot per plan.

### Fix (no Phase C, no taxonomy redefinition, no UI changes)

#### 1. Category fan-out registry — `_shared/events/event-phase-map.ts`

```ts
export const CATEGORY_MAX_SLOTS: Record<EventCategoryId, number> = {
  A: 2,   // pre + post when both windows land in horizon
  B: 1,
  C: 1,   // ← Coca-Cola Presentation
  D: 2,   // pre + post same day
  E: 1,
  F: 3,   // multi-day conference: pre + during-nudge + post per day
  G: 3,   // long-haul: pre-flight + in-flight + landing
  H: 1,
};
```

The only rule governing "can the same event take more than one slot". The resolver consults it; nothing inline.

#### 2. Variable slot count: 1 ≤ slots ≤ 3

The resolver builds a **candidate list** of meaningful priorities for the current window, then emits `min(3, candidates.length)` slots. A slot is "meaningful" only if it carries either:

- a JIT phase that is eligible in the current window (per `jit-candidates.ts` ranking), OR
- a state-anchored intent backed by a non-duplicate anchor (distinct calendar event, calendar load, wearable deficit, or tomorrow's lead event for the evening contract).

If no second/third meaningful candidate exists, **the plan ships with 1 or 2 slots — no padding**.

Wired through `applyV51Enrichment` so the existing `mergeWithLedger` keeps working: completed slots stay crossed out, incomplete slots keep their practices. When the resolver returns fewer than the prior plan's slot count, surplus old slots are pruned (not silently filled).

Worked examples:

- **Evening + heavy day + tomorrow JIT (board 09:00):** Slot 1 = JIT prep at T-12h (Contract A pre), Slot 2 = state-anchored recovery ("Recover sleep debt ahead of tomorrow's board"). **2 slots, not 3.**
- **Evening + heavy day + no upcoming JIT:** Slot 1 = state-anchored decompression / sleep prep. **1 slot.**
- **Morning + dense calendar + 1 JIT in 2h + 1 JIT in 6h:** Slot 1 = imminent JIT pre, Slot 2 = state-anchored bridge ("Re-consolidate focus ahead of today's load"), Slot 3 = second JIT pre. **3 slots.**
- **Weekend with no events:** Slot 1 = state-anchored ("Build capacity ahead of Monday's load"). **1 slot.**

Hard guarantee: `modules.length >= 1 && modules.length <= 3` at the persistence boundary. The "≥ 1" floor is satisfied by the always-available state-anchor fallback (felt-state verb + generic anchor — e.g. "Steady the system ahead of the evening ahead" — never references an event id).

#### 3. Slot-anchor bookkeeper (used by §4 and §5)

```ts
const slotAnchors: { eventId: string | null; phase: Phase | null }[] = [];
function anchorsUsedFor(id: string)   { return slotAnchors.filter(a => a.eventId === id).length; }
function canAnchorAgain(id: string, cat: EventCategoryId) {
  return anchorsUsedFor(id) < (CATEGORY_MAX_SLOTS[cat] ?? 1);
}
```

Every slot pushes its anchor after it's built. JIT branches and `composeStateLabel` consult `canAnchorAgain` before adopting an event.

#### 4. Gate the JIT slot-2 / slot-3 re-trigger on category

The two JIT branches in slot 2 (lines 4071 and 4077) currently re-fire on `topEvent` whenever `jitMinutesUntil >= 120`. Wrap both:

```ts
const topCat = topEvent ? enrichEvent(topEvent.event).categoryId : null;
const canReuseTopEvent = topCat && canAnchorAgain(topEvent.event.id, topCat);
if (hasJitEvent && !slot1IsJit && canReuseTopEvent && /* existing window guard */) { … }
```

For C/E/B/H this collapses to a single JIT slot.

#### 5. `composeStateLabel` — dedup fallback chain (replace single-shot anchor pick)

Inside `composeStateLabel(slotIndex)`:

- Walk a fallback chain instead of picking one lead event:
  - First today event whose id is not already in `slotAnchors` AND its category permits another slot.
  - Else calendar-load anchor: "today's back-to-back load" / "today's dense calendar".
  - Else wearable-anchor: "Restore HRV ahead of tomorrow's load" etc.
  - Else generic: "the evening ahead" / "tomorrow's load" / "Monday's load".
- Slot 3 (`slotIndex === 2`): same chain against `tomorrowEvents` first.
- Never return a string that names an event already anchored when `CATEGORY_MAX_SLOTS[cat] === 1`.
- If the chain produces **no distinct anchor** AND this slot is index ≥ 1, return `null` → resolver drops the slot (variable-slot floor from §2 takes over).

#### 6. Behaviour after fix (screenshot scenario)

Coca-Cola Client — Presentation (category C, tomorrow, >120 min):

- **Slot 1** — state-anchored, "…ahead of tomorrow's Coca-Cola Client — Presentation". `slotAnchors = [{coca, null}]`.
- **Slot 2** — `canAnchorAgain(coca, 'C')` → false. Fallback chain finds no distinct event → returns null → **slot dropped**.
- **Slot 3** — same dedup. If calendar load is high and HRV deficit exists → "Restore HRV ahead of tomorrow's load". Otherwise also dropped.
- **Result:** 1 slot (single C event, no other signal) or 2 slots (single C event + meaningful state signal). Never 3 slots referencing the same Coca-Cola event.

Long-haul flight tomorrow (G, max 3) unaffected: Pre-flight, In-flight, Landing each get their own slot.

### Tests (Deno, `_shared/events/category-slot-fanout.test.ts`)

- Category C event 6 h away, no other signals → **1 slot**, references it once.
- Category C event 6 h away + dense calendar + HRV deficit → **2 or 3 slots**, only one references the event; others use load/HRV anchors.
- Category G long-haul → **3 slots**, pre/during/post phases of the same flight.
- Category F multi-day conference (speaking Tue) → Tue plan = 2 slots (pre + post on keynote); Mon plan = 1 slot (pre only).
- Evening + no JIT → **1 slot**, state-anchored, never references an event.
- Weekend with empty calendar → **1 slot**, "Build capacity ahead of Monday's load".
- Variable-count invariant: `1 ≤ modules.length ≤ 3` across all fixtures.

### Files touched

- `supabase/functions/_shared/events/event-phase-map.ts` — add + export `CATEGORY_MAX_SLOTS`.
- `supabase/functions/generate-mastery-plan/index.ts` — add `slotAnchors`, gate JIT slot-2 branches, rewrite `composeStateLabel` to use deduplicating fallback chain returning `null` when no distinct anchor, switch slot emission from hard-coded 3 to `modules.push(...)` only when a candidate exists, prune trailing nulls before persistence.
- `supabase/functions/_shared/events/category-slot-fanout.test.ts` — new.
- `mem/features/mastery-plan/slot-model-v5.md` — add note: "3-slot count is a ceiling, not a floor. Floor is 1. Padding slots forbidden."
- `.lovable/plan.md` — append "Pre-Phase-C dedup + variable slot count" status section.

No UI changes — `TodayThreePriorities.tsx` already maps over whatever modules the server returns; rendering 1 or 2 modules is a no-op.

No Phase C work. No taxonomy changes.