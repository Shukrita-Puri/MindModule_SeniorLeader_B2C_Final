
## Mandatory contract (applies equally to slot 1, slot 2, slot 3)

The app exists to drive **CEO cognitive performance** through the framework: **Prevent** (stress accumulation, emotion hijack, decision leakage, multi-day degradation, travel fatigue, post-peak hangover, notification overload, weekend dropout) and **Prepare / Build** (recovery that feeds the next event, circadian resilience, executive presence on demand, sustained focus capacity, emotional labour capacity, daily habit architecture).

State management without a calendar anchor disrespects this role. Therefore every slot MUST resolve to **exactly one** of the following — never a bare literal, never abstract self-regulation:

| # | Contract | Label pattern |
|---|---|---|
| A | **Pure JIT** — pinned to a specific event in the horizon | `Prepare ahead of <Event Title>` |
| B | **State anchored to a JIT** — state signal made meaningful by the upcoming event | `<state action> ahead of <Event Title>` (today or tomorrow) |
| C | **State anchored to the day ahead** — state signal made meaningful by today's calendar load/pressure | `<state action> ahead of today's <load / pressure descriptor>` |
| D | **End-of-day → next-day** — closing today's load to build capacity for tomorrow's lead event or load | `<state action> ahead of tomorrow's <Event / load>` |
| E | **Weekend / PTO recovery toward next performance moment** — light anchor that maintains ritual and feeds the next known event | `Restore ahead of <next event / Monday's <load>>` or `Maintain rhythm into <next event>` |

There is no contract F. No slot may emit a label without a calendar/performance anchor.

Slot 1, slot 2, slot 3 are **not** hard-wired to any single contract. Each slot independently resolves to A / B / C / D / E based on signals at generation time.

## Per-slot resolver (uniform)

```
For each slot i in [0,1,2], with takenEventIds carried forward:

  1. Try Contract A (Pure JIT)
     - Pick highest-ranked eligible event from rankedJitCandidates not in takenEventIds.
     - If found → label = "Prepare ahead of <evt.title>", isJit = true,
       replacementEventIds = [evt.id]. takenEventIds.add(evt.id). Done.

  2. Else try Contract B (State → JIT)
     - If a dominant state signal exists AND any upcoming high-stakes event
       (today or tomorrow) is not yet taken → label = composeStateLabel
       with calendar anchor = "<today's | tomorrow's> <Event>".

  3. Else try Contract C (State → day ahead)
     - If a dominant state signal exists AND today still has calendar
       pressure (load tier ≥ moderate, or back-to-back density)
       → label = "<state action> ahead of today's <load descriptor>".

  4. Else try Contract D (End-of-day → next day)
     - If slot sits in the closing window OR tomorrow has a lead high-stakes
       event / heavy load → label = "<state action> ahead of tomorrow's
       <Event | full day of <pillar>>".

  5. Else try Contract E (Weekend / PTO recovery toward next moment)
     - If weekend or PTO context detected (per CEO-Reality tags
       public_holiday / personal_pto / weekend) → label = "Restore ahead of
       <next known event>" or "Maintain rhythm into Monday's <load>".

  6. Hard fallback (only if no calendar context exists at all in the horizon)
     - Slot 1/2: "Steady the system for today's load"
     - Slot 3:   "Build capacity for tomorrow's load"
     (Still references the day; never bare. Logged as a degraded path.)
```

JIT is rank-based, not slot-locked: the most urgent eligible event goes to whichever slot resolves first; remaining slots fall through to B / C / D / E. Slot 1 is NOT JIT-only. Slot 3 is NOT "Prepare for tomorrow"-only.

## `composeStateLabel` — shared by contracts B / C / D / E

**State action** (priority, first match):
- HRV deficit → `Restore HRV`
- Sleep deficit → `Recover sleep debt`
- Sustained load / decision_leakage tag → `Decompress`
- Post-peak hangover tag → `Reset after yesterday's peak`
- Cognitive fragmentation today → `Re-consolidate focus`
- Veto-risk tag (masked fatigue) → `Settle the system`
- Circadian travel tag → `Re-anchor circadian rhythm`

**Calendar anchor** (priority by contract):
- B → `<today's | tomorrow's> <Event title>` (lead high-stakes event)
- C → `today's <Event>` OR `today's full day of <dominant pillar>` OR `today's back-to-back load`
- D → `tomorrow's <Event>` OR `tomorrow's full day of <pillar>` (e.g. "conference and speaking", "back-to-back interviews", "long-haul travel")
- E → `<next known event>` OR `Monday's <load>`

Worked examples this must produce, valid in **any** slot:

- (A) `Prepare ahead of Board meeting`
- (B) `Restore HRV ahead of tomorrow's board call`
- (B) `Re-consolidate focus ahead of today's investor call`
- (C) `Decompress ahead of today's back-to-back load`
- (C, slot 1) `Restore HRV ahead of today's dense calendar`
- (D) `Restore HRV ahead of long-haul travel tomorrow`
- (D) `Decompress ahead of tomorrow's full day of conference and speaking`
- (D) `Reset after yesterday's peak ahead of tomorrow's board call`
- (E, Sunday pm) `Maintain rhythm into Monday's board prep`
- (E, weekend) `Restore ahead of next week's investor roadshow`

## Forbidden final labels (never reach the client)

`Midday reset`, `Later today`, `When you have space`, `This evening`, `Before bed`, `For your development`, `When ready`, `Prepare for the day`, `Prepare for tomorrow`, `Morning reset`, `Prevent the afternoon dip`. These may exist as internal scheduling hints but MUST be rewritten before emission.

## MVP scope guard

Out-of-scope for MVP: material event prep (briefing prep, deck review, talking points). The non-JIT contracts are strictly Self-Regulation framing anchored to calendar pressure — never content prep. Sparring-partner / coach features will extend this later.

## Files

- `supabase/functions/generate-mastery-plan/index.ts`
  - Introduce `resolveSlot(slotIndex, takenEventIds, rankedJitCandidates, prior, state, calendar, ceoReality)` returning the contract A/B/C/D/E result.
  - Apply uniformly at initial slot construction for slot 1, slot 2, slot 3, AND at the per-slot replacement override (~line 2787) — replacing the silent `continue` with synthesis so the chosen event always lands in the clicked slot.
  - All JIT emissions normalised to `Prepare ahead of <Event>` (drop `· in X hrs` / `· today` / `· now`).
  - `composeStateLabel` shared across B/C/D/E.
  - Blacklist of bare literals enforced at final emission.
  - Weekend / PTO branch (E) wired to existing CEO-Reality tags (`public_holiday`, `personal_pto`, weekend detection) — Light morning anchor maintained, anchored to next known performance moment.

- `src/components/home/TodayThreePriorities.tsx`
  - `performanceSlotLabel`: keep only the legacy `^Before ` → `Prepare ahead of ` rewrite. Delete the three generic substring mappers. Server is the single source of truth.

## Validation matrix

| Scenario | Expected label | Contract |
|---|---|---|
| Slot 1, board call in 90 min | `Prepare ahead of Board call` | A |
| Slot 1, no JIT, HRV deficit, dense morning ahead | `Restore HRV ahead of today's back-to-back load` | C |
| Slot 2 cancelled → user picks "Board meeting" | `Prepare ahead of Board meeting` (in slot 2, slots 1+3 untouched) | A |
| Slot 2, cognitive fragmentation + investor call later today | `Re-consolidate focus ahead of today's investor call` | B |
| Slot 3, HRV deficit + tomorrow board call | `Restore HRV ahead of tomorrow's board call` | D |
| Slot 3, HRV deficit + tomorrow long-haul flight | `Restore HRV ahead of long-haul travel tomorrow` | D |
| Slot 3, sustained load + tomorrow conference | `Decompress ahead of tomorrow's full day of conference and speaking` | D |
| Any slot, Sunday pm, Monday board prep | `Maintain rhythm into Monday's board prep` | E |
| Any slot, weekend, next event = roadshow | `Restore ahead of next week's investor roadshow` | E |
| No bare literals (`Prevent the afternoon dip`, `Prepare for tomorrow`, `Prepare for the day`, `Morning reset`) ever reach the UI in any slot | — | — |
