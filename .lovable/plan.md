

# Signal Triage + Temporal Triangulation Refactor

## The Problem (Claude is right)

The current prompt (lines 3053-3197) sends ~145 lines / ~600 tokens to the LLM, including many "NULL" fields. The LLM must triage noisy data before doing its actual job: writing 2 sentences. This produces inconsistent, often generic output.

## The Fix

Two new TypeScript functions replace the monolithic prompt construction. All 15 data queries remain unchanged — only the prompt delivery changes.

### 1. `buildPrioritisedSignals()` — Signal Triage

Selects max 5 signals in strict priority order. No NULLs ever sent.

**Priority cascade:**
1. JIT event < 90 mins (always dominates) + HRV correlation if available
2. Wearable divergence MASKED_HIGH (body load user hasn't registered)
3. Most specific personalisation: coach commitment > coach pattern > consecutive low days (3+) > today vs typical DOW
4. Tomorrow context (evenings only): heavy tomorrow or rest-day-eve
5. Week ahead (Sunday evening only): heaviest day + first HS event
6. Physiological deviation (HRV/sleep) if not already covered by divergence
7. Score trajectory vs yesterday (if delta > 5)
8. Back-to-back density (if longest block >= 2hrs)

Cap at 5. Priority order is the filter.

### 2. `triangulateSignals()` — Cross-Horizon Connection

Classifies each available signal into a temporal horizon:
- **Immediate**: JIT event, divergence mode, current tier/score, felt state
- **Tactical**: HRV correlation, consecutive patterns, DOW comparison, trajectory, friction trend
- **Strategic**: Coach commitment, coach growth area, archetype watch-for

Then computes `crossHorizonConnection`:
- `immediate_confirms_tactical` — today confirms a pattern
- `tactical_connects_strategic` — pattern connects to development goal
- `immediate_activates_strategic` — today tests a growth area
- `immediate_tactical_strategic` — all three align (strongest signal)

Also determines `dominantHorizon` (which horizon leads the sentence).

### 3. Restructured Prompt (~150 tokens, not ~600)

**System prompt** (shorter, adds triangulation core rule):
```
You are a performance intelligence system briefing a C-suite leader.
Voice: trusted chief of staff. Precise. Never generic.

Produce two things:
1. PHRASE: 3-6 words. Crisp directive.
2. BODY: One sentence, max 15 words. **Bold** the key action.

Core rule: if triangulation data is provided, the body MUST connect
at least two time horizons — what is true now AND what pattern or
goal this connects to.

Rules: [same hard rules, condensed — no wellness words, no affirmations,
no "readiness", JIT < 90 dominates, null = output null]
```

**User prompt** (dynamically assembled, zero NULLs):
```
[tier] · [score]/100 · [timeOfDay] · [dayName]

[IF context frame]: Context: [one line — Sunday/Friday/Monday framing]

Key signals:
[5 lines max from buildPrioritisedSignals()]

[IF crossHorizonConnection]:
Triangulation:
  Now: [immediateSignal]
  Pattern: [tacticalSignal]
  Development: [strategicSignal]
  Connection: [type + framing guide]
  Lead with: [dominantHorizon]

[IF coachStrength]: Their strength: [text]
[IF archetype]: Archetype: [title]
```

### 4. Framing guides (in triangulation section only when connection exists)

- `immediate_confirms_tactical`: "Today is confirming a pattern — connect the two explicitly."
- `tactical_connects_strategic`: "The pattern connects to their development goal — make that connection visible."
- `immediate_activates_strategic`: "Today's state activates their development area — connect them."
- `immediate_tactical_strategic`: "All three horizons align — this is the most powerful brief. Be specific."

## What Changes

**File**: `supabase/functions/compute-outer-readiness/index.ts`

1. Add `buildPrioritisedSignals()` function (~60 lines) before the LLM block
2. Add `triangulateSignals()` function (~80 lines) before the LLM block
3. Add `getContextFrame()` helper (~10 lines) — returns one context line for Sunday/Friday/Monday or null
4. Replace lines 3009-3197 (system prompt + user prompt construction) with the new short prompt assembled from triage + triangulation output
5. LLM call mechanics (lines 3199-3242), fallback logic, and response payload — all unchanged

## What Does NOT Change

- All 15 enrichment data queries (they feed the triage function)
- The deterministic fallback template system (`getTheme`, `buildMorningTheme`, etc.)
- The LLM call mechanics (same endpoint, same model, same timeout, same JSON parsing)
- The response payload structure
- All auth, scoring, and cascade logic

## Why This Is Better for Gemini Flash

- ~75% fewer tokens per call — Gemini Flash is optimized for short focused prompts
- Zero NULL noise — model never has to decide what to ignore
- "Reference at least one specific signal" + only 5 signals = consistently data-grounded output
- Triangulation instruction produces output that connects horizons (feels intelligent, not just informed)
- Triage function is deterministic and unit-testable — you can see exactly which signals were selected

## Patent Alignment

The triangulation function directly implements the patent's Core Innovation 1 (temporal triangulation across immediate/tactical/strategic horizons) in code, not just in data collection. The `crossHorizonConnection` computation and the LLM instruction to reference multiple horizons makes the patent claim demonstrable in the output.

