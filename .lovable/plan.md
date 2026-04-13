

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

### 2. Restructure User Prompt Assembly

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 3200-3260)

Replace the current flat signal list with the v4 structured data sections:

- `=== TIME ===` — slot, day, weekend/holiday flags, hours remaining
- `=== READINESS ===` — score, tier (reasoning only), yesterday score, trend, felt state, clarity, confidence, consecutive low days
- `=== WEARABLE ===` (conditional) — HRV/RHR/sleep with absolute values + baselines + deviations, divergence mode, 7d trend, confidence level
- `=== CALENDAR TODAY ===` (conditional) — C-suite classified load, high-stakes titles, back-to-back, next events
- `=== TOMORROW ===` (evening/Friday/Sunday only)
- `=== WEEK AHEAD ===` (Sunday evening only)
- `=== PATTERNS ===` (conditional on check-in count thresholds: 3/7/30)
- `=== ONBOARDING ===` (always when available) — goals, archetype, traits, commitments

All enrichment data already fetched (lines 2497-2978) will be wired into these sections. The triangulation block stays but gets integrated into the structured format.

### 3. Expand LLM Output Contract

**Current**: `{"phrase": "...", "bodyText": "..."}`  
**New**: 
```json
{
  "phrase": "3-6 word directive or null",
  "bodyText": "One sentence. <strong>Bold action</strong>. Or null.",
  "leanOn": [{"signal": "1-3 words", "source": "Check-in|Wearable|Calendar|Coach|Archetype|Patterns|Goals"}],
  "watchFor": [{"signal": "1-3 words", "source": "Check-in|Wearable|Calendar|Coach|Archetype|Patterns|Goals"}]
}
```

Update the JSON parsing logic (lines 3288-3305) to extract `leanOn[]` and `watchFor[]` from the LLM response.

### 4. Update Response Object

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 3356-3416)

When LLM returns valid leanOn/watchFor arrays, use those instead of the deterministic `getLeanOnWatchFor()` output. The deterministic cascade remains as **fallback only** — invoked when LLM returns null or fails validation.

Format the LLM leanOn/watchFor arrays into the string format the client expects:
- `leanOn`: Items joined as "Signal · Source\nSignal · Source"
- `watchFor`: Same format

### 5. Add Post-Generation Validation

**File:** `supabase/functions/compute-outer-readiness/index.ts`

After parsing LLM output, run v4 validation rules before accepting:

- **Phrase rejection**: Contains blacklisted word, names day >2 away, matches known fallback template, could apply to any user
- **Body rejection**: Contains score tier, >20 words, restates phrase, contains literal asterisks
- **LeanOn/WatchFor rejection**: Any item >4 words, no source, is a sentence, duplicates a signal pill label

On rejection: retry once (temperature 0). If second attempt fails: null that field and fall back to deterministic.

### 6. Update Client Rendering for LLM Lean On / Watch For

**File:** `src/components/home/DecisionReadinessBrief.tsx` (lines 632-666)

Update the Lean On and Watch For sections to:
- Parse the new format (signal · source pairs)
- Render each pair on its own line with the source as attribution
- Support `<strong>` HTML tags in body copy (already partially done — enhance to also handle `<strong>` tags, not just `**`)
- Keep existing pill badges ("Lean on" / "Watch for") unchanged

### 7. Update Fallback Logic

**File:** `supabase/functions/compute-outer-readiness/index.ts`

Replace the current template-based fallback (lines 3330-3332) with v4 fallback:
- Phrase: archetype lean-on trait + time-of-day slot
- Body: onboarding goal relevant to current day type
- LeanOn: archetype lean-on (Archetype) + onboarding goal (Goals)  
- WatchFor: archetype watch-for (Archetype)
- If archetype also null: return null JSON entirely

### 8. Include v4 Examples as Few-Shot

Add a compact few-shot block (3-4 examples from the corrected v5 examples provided) into the system prompt to calibrate the model's register and specificity level. Examples selected to cover: pattern-linked phrase, MASKED_HIGH, cold start, and consecutive low days.

## Files Modified

1. `supabase/functions/compute-outer-readiness/index.ts` — System prompt, user prompt assembly, output parsing, validation, fallback, response formatting
2. `src/components/home/DecisionReadinessBrief.tsx` — Lean On / Watch For rendering to support structured signal · source pairs and `<strong>` HTML tags

## What Does NOT Change

- Signal pills (colors, gradients, dots removal — all preserved)
- Score row, calendar pills, raw numbers panel
- Any other UI outside Lean On / Watch For rendering
- The deterministic `getLeanOnWatchFor()` cascade (kept as fallback)
- All enrichment data queries (already comprehensive)

