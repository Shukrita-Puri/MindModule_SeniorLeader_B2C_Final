

# Batch 2: Decision Readiness Brief — Implementation Plan

## Overview
Replace `TodayStateCard` + `StrategicIntentionCard` on the homepage with a single unified `DecisionReadinessBrief` component. Variant A only (interpretation chips) with tap-to-flip number reveal. Add LLM synthesis to `compute-outer-readiness`, reweight scores in `compute-inner-readiness`, fix hardcoded fields, and add `leanOnSource`/`watchForSource` to the edge function response.

## Critical Rules (confirmed)
- TodayStateCard.tsx and StrategicIntentionCard.tsx remain in codebase, just stop rendering on homepage
- Existing card styling preserved (white surface, taupe left border, existing borders/radius)
- No edge function logic changes except the specific ones listed below
- All new queries wrapped in try/catch, return null on failure

---

## Part 1: New Component — `DecisionReadinessBrief.tsx`

**File:** `src/components/home/DecisionReadinessBrief.tsx`

Consumes data from both `useQuery(['energy-state'])` and `useOuterReadiness()` hooks (already cached).

**Card structure (top to bottom):**

1. **Eyebrow row** — "DECISION READINESS BRIEF" left, "[time] · [date]" right (9px uppercase, muted)
2. **Score row** — Score number (40px, weight 500), colour-coded by tier (existing depleted/managing/strong colours), "/100" muted, tier label uppercase. No check-in: "--" + "NOT YET ASSESSED"
3. **Calendar pills** — Conditional rendering based on high-stakes proximity (90min), load, or no calendar. Uses existing pill styling from the app
4. **Phrase** — Georgia serif italic 14px, from `outerBrief.phrase`
5. **Body copy** — 12px, from new `outerBrief.bodyText` field (LLM-generated), falls back to `outerBrief.context`. Bold key action via `<strong>`
6. **"BASED ON YOUR SIGNALS"** section label (9px uppercase muted)
7. **Signal chips** — Variant A interpretation labels, flex-wrap, pill shape with coloured dot + text (10px). Max 5 chips. Each chip is tappable — flips to reveal the number behind it (e.g., "Body under load" flips to "HRV −18%"), taps again to flip back. CSS card-flip animation.

   Chip logic (deterministic, no LLM):
   - Wearable chips (only if hasWearable AND ≥7 days data): HRV deviation, sleep deviation, RHR deviation thresholds as specified
   - Wearable < 7 days: single "Wearable calibrating" neutral chip
   - No wearable: omit all physiological chips entirely
   - Felt state chips from `checkInOutcome`
   - C×C chips from `clarityLevel`/`confidenceLevel` (fixed from hardcoded 0)
   - Longitudinal qualifiers based on data age
   - No check-in: single neutral "Check in to unlock your state" chip

8. **Inner summary line** — 3-word synthesis below chips (11px, muted, weight 500). Derived from worst→best→C×C chip content. Omit if no check-in.
9. **Divider** (existing style)
10. **"HOW TO SHOW UP"** section label
11. **Lean on row** — Green pill + main text + sub-text for source (from new `leanOnSource` field)
12. **Watch for row** — Amber pill + same structure with `watchForSource`
13. **Data source note** — 9px, 35% opacity, showing connected sources
14. **"Tap for raw numbers"** — 9px right-aligned, expand/collapse panel showing raw HRV ms, sleep score, RHR bpm, clarity/5, confidence/5, score tier + weighting mode

**Data requirements from edge functions (new fields needed):**
- `outerBrief.bodyText` (LLM-generated body copy, falls back to context)
- `outerBrief.leanOnSource` (string describing cascade source)
- `outerBrief.watchForSource` (string describing cascade source)
- `outerBrief.hrvDeviation` (number, % vs baseline)
- `outerBrief.sleepDeviation` (number, % vs baseline)
- `outerBrief.rhrValue` (number, bpm)
- `outerBrief.sleepScore` (number)
- `outerBrief.hrvValue` (number, ms)
- `outerBrief.hasWearable` (boolean)
- `outerBrief.wearableDaysConnected` (number)
- `outerBrief.hasCalendar` (boolean)
- `outerBrief.calendarLoad` (string)
- `outerBrief.meetingCount` (number)
- `outerBrief.highStakesEvents` (string[])
- `outerBrief.nextHighStakesEvent` (object with title + minutesUntil)
- `outerBrief.checkInCountTotal` (number, for data completeness tier)
- `outerBrief.consecutiveLowConfidence` (number, for "Xth day" qualifier)
- `outerBrief.coachStrength` (string, for "your strength" qualifier)

Several of these already exist in the edge function response or can be derived; the rest need to be added to the response payload.

---

## Part 2: Homepage Wiring — `ExecutiveHome.tsx`

- Stop rendering `<TodayStateCard />` and `<StrategicIntentionCard />`
- Render `<DecisionReadinessBrief />` in their place (single card in the STATE section)
- Pass JIT event data as prop (same as current StrategicIntentionCard)
- Keep imports of old components (they stay in codebase)

---

## Part 3: Edge Function Changes — `compute-outer-readiness/index.ts`

### 3a: Add `leanOnSource` / `watchForSource` to response
Map `leanOnResult.source` to human-readable labels:
- `coach-insights-recent` / `coach-insights-grace` → "From coach conversations"
- `cc-modifier` / `cc-modifier-with-context` → "From your check-in today"  
- `coach-partial-strength` / `coach-partial-growth` → "Coach + archetype"
- `archetype-tier` → "From your archetype"
- `tier-fallback` → "From readiness score"
- Evening/Sunday overrides → "From readiness score"

### 3b: Add new data fields to response
Expose to client: `hasWearable`, `wearableDaysConnected`, `hrvDeviation`, `sleepDeviation`, `rhrValue`, `sleepScore`, `hrvValue`, `hasCalendar`, `calendarLoad`, `meetingCount`, `highStakesEvents`, `nextHighStakesEvent`, `checkInCountTotal`, `consecutiveLowConfidence`, `coachStrength`, `bodyText`.

### 3c: Add LLM synthesis (`generateLLMBodyCopy()`)
- Query `checkInCountTotal` = `COUNT(*)` from `daily_checkins` for user (try/catch, default 0)
- Determine `dataCompleteness`: day1 (0), early (1-6), developing (7-30), established (30+)
- Skip LLM if day1
- Call Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with `google/gemini-2.5-flash` using `LOVABLE_API_KEY` (already exists as secret)
- System prompt and user prompt as specified in the request, injecting available data fields only
- Parse JSON response for `{ phrase, bodyText }`
- If either is null or parse fails: use existing template functions as fallback
- Log "DRB phrase source: llm | template" and "DRB body source: llm | template"

### 3d: Additional queries (all additive, try/catch)
1. Typical DOW outcome (60-day, min 4 occurrences)
2. Friction trend (7d vs 8-14d drained/scattered/overwhelmed count)
3. Pending coach commitment
4. Recent coach pattern (7d)
5. Dominant outcome last 7d
6. Wearable trend last 7d (recent 3d vs earlier 4d avg HRV)
7. Wearable days connected count
8. HRV/sleep deviation from 30-day baseline
9. Consecutive low-confidence days

---

## Part 4: Scoring Reweight — `compute-inner-readiness/index.ts`

Change ONLY weight values in the scoring section (lines ~544-562). Keep all other logic exactly as-is.

| Mode | Old Weights | New Weights |
|------|------------|-------------|
| No wearable | felt 55%, C×C 30%, circ 15% | felt 40%, C×C 45%, circ 15% |
| Aligned | felt ~40%, wearable ~25%, C×C ~22%, circ 10% | felt 25%, wearable 35%, C×C 30%, circ 10% |
| MASKED_HIGH | wearable 35% | wearable 40%, remainder split equally felt/C×C |
| RECOVERY_UNDERWAY | wearable 30% | wearable 35%, remainder split equally felt/C×C |

---

## Part 5: Fix Hardcoded Fields — `DailyRitual.tsx`

- Fix lines passing `clarityLevel: 0` → `clarityLevel: energyState?.clarityLevel ?? 0`
- Fix `confidenceLevel: 0` → `confidenceLevel: energyState?.confidenceLevel ?? 0`
- Fix `archetype: ''` → `archetype: profile?.user_archetype ?? ''`

Also update `useOuterReadiness` hook interface to include the new fields.

---

## Implementation Order

1. Update `compute-inner-readiness` scoring weights (Part 4)
2. Update `compute-outer-readiness` with new queries, LLM synthesis, leanOnSource/watchForSource, and expanded response payload (Part 3)
3. Update `useOuterReadiness` hook interface for new fields (Part 5)
4. Fix DailyRitual hardcoded fields (Part 5)
5. Build `DecisionReadinessBrief.tsx` component (Part 1)
6. Wire into `ExecutiveHome.tsx`, stop rendering old cards (Part 2)

## Files Modified
- `supabase/functions/compute-inner-readiness/index.ts` — weight values only
- `supabase/functions/compute-outer-readiness/index.ts` — add LLM, new queries, new response fields
- `src/hooks/useOuterReadiness.ts` — extend interface
- `src/components/home/DecisionReadinessBrief.tsx` — **new file**
- `src/pages/ExecutiveHome.tsx` — swap cards
- `src/components/home/DailyRitual.tsx` — fix hardcoded 0s

## Files NOT Modified
- `src/components/home/TodayStateCard.tsx` — kept as-is
- `src/components/home/StrategicIntentionCard.tsx` — kept as-is
- No routing changes, no desktop layout changes

