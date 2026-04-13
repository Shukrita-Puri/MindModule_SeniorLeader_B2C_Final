


# Upgrade Performance Readiness Brief LLM to v4 Spec

## Summary

The current `compute-outer-readiness` edge function uses a simplified LLM prompt that produces generic phrase/body output and relies on deterministic fallback tables for Lean On / Watch For. The v4 spec requires the LLM to generate **all four fields** (phrase, body, leanOn[], watchFor[]) as a "Chief of Staff for the Mind" — pattern-linked, user-specific, with strict anti-pattern validation.

## What Changes

**Scope: Only Phase, Body, Lean On, Watch For copy.** No signal pill changes. No other UI changes to the card.

### 1. Rewrite LLM System Prompt (edge function)

**File:** `supabase/functions/compute-outer-readiness/index.ts`

Replace the current ~35-line system prompt (lines 3164-3198) with the full v4 spec:

- **Persona**: "Chief of Staff for the Mind" — not generic COS, not wellness coach. Every output must be about attention, interpretation, decision behavior (not workload management).
- **6-Step Silent Reasoning Protocol**: Body system → Compound signals → Layer felt state → Calendar demand → Pattern/history → One thing.
- **Output contract**: JSON with `phrase`, `bodyText`, `leanOn[]`, `watchFor[]` — where leanOn/watchFor are arrays of `{signal, source}` objects.
- **Hard constraints**: Wellness blacklist, score tier blacklist, readiness blacklist, no phrase in body, body max 20 words, bold action via `<strong>`, null discipline, wearable hierarchy.
- **Day-type overrides**: Sunday evening (forward into Monday), Monday morning (week-entry), Friday/pre-rest evening (closure), weekend daytime (agency, not performance), public vs personal holiday, post-high-stakes afternoon, consecutive low days (3+).
- **Signal synthesis patterns**: Clarity-Confidence Split, MASKED_HIGH, Compounded Deficit, Historical Event Correlation, Supply-Demand Gap, Sunday Anxiety, Recovery Underway, Consecutive High-Stakes, Coach Signal Active.
- **Cold start (Day 1-7)**: Archetype + goals always sufficient. Never generic. Never reference missing data.
- **Fallback**: If LLM fails, use archetype lean-on + onboarding goal. If archetype null, return null JSON. Generic output is worse than silence.
- **Temperature**: 0 (deterministic).

### Status: IMPLEMENTED ✅

---

# Fix Today's 3 Performance Priorities — Context Chain, Deduplication, Time Bugs, and Multi-Practice Sequences

## Summary

Upgraded the Priorities card to inherit the Brief's intelligence, fix time hallucinations, JIT dedup, and support multi-practice sequences per slot.

## What Changed

### Edge Function: `supabase/functions/generate-mastery-plan/index.ts`

1. **`buildWhyLine()` → `buildSlotContext()`**: Replaced 22-parameter flat function with structured `SlotContextInput` object producing `SlotContext { situation, whyLine }`. Uses "Because X → we do A → so that Y" causal logic with signal priority cascade (HRV correlation → divergence → coach → pattern → calendar → archetype → fallback).

2. **Time-of-day fix**: All copy derives from `timeOfDay` parameter via `getTimeAnchor()`. Never hardcodes "this morning".

3. **JIT dedup guard**: Slot 2's JIT checks now include `&& !slot1IsJit` to prevent same event in both slots.

4. **Multi-practice per slot**: `HorizonModule` extended with `practices: any[]` (1-3) and `sequenceReasoning?: string`. Slot 1 gets regulate+align when depleted, all JIT modules when JIT. Slots 2-3 get 1-2 practices from remaining pool.

5. **Brief relay signals**: `outerReadinessCache` (phrase, body, leanOn, watchFor) passed into `buildHorizonModules()` and available to `buildSlotContext()`.

6. **`buildSequenceReasoning()`**: New function that generates causal chain reasoning when multiple practice types are sequenced.

### Frontend: `src/components/home/TodayThreePriorities.tsx`

1. **Multi-practice horizontal scroll**: When a slot has 2-3 practices, renders them in a horizontal scrollable container at 80% width with snap-to-start.

2. **Sequence reasoning**: Displayed above practice cards in expanded view (non-italic, medium weight).

3. **Per-practice reasoning**: Each card in multi-practice shows its individual reasoning text.

4. **Step indicators**: "Step 1 of 2" labels on multi-practice cards.

5. **Slot completion**: Number circle turns green only when ALL practices in slot completed. Collapsed view shows "(X of Y)" count.

6. **Start button**: Navigates to first uncompleted practice. Shows "Continue (1/2)" when partially complete.

7. **Practice queue**: `allPractices` flattened from all `practices[]` arrays for queue and completion tracking.

## Status: IMPLEMENTED ✅
