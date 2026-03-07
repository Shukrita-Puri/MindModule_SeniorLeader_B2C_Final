

# Outer Readiness Brief — Revised C×C Logic Implementation Plan

## What's Already Done (from previous changes)
- C×C independent signal evaluation (8 patterns) in `getCCModifier` — **already implemented**
- Sunday evening + weekday evening Lean On/Watch For objects — **already exist**

## What Needs to Change

### Change 1: Coach Insights Recency + Contradiction Check (Priority 1)

**Current:** Coach insights always win when present (lines 466-468). No recency check, no contradiction detection.

**New logic:**
- Add `created_at` to the coach insights query (line 585)
- ≤ 3 days old: always use coach insights
- \> 3 days old AND contradicts today's C×C (coach says "clarity" but clarity ≤ 2, or "confidence" but confidence ≤ 2): skip to Priority 2
- \> 3 days old AND no contradiction: still use coach insights

**Files:** `supabase/functions/compute-outer-readiness/index.ts` — lines 583-603 (query) and lines 421-492 (getLeanOnWatchFor)

### Change 2: Restructure Priority Cascade in `getLeanOnWatchFor`

**Current priority order:**
- Late evening block (lines 435-462): Coach → C×C → Sunday/Evening fallback
- Daytime block (lines 464-491): Coach → C×C → Archetype → Tier

**New priority order:**
- Priority 0: Sunday evening (after 9pm on Sunday) — always wins
- Priority 1: Coach insights (with recency + contradiction check)
- Priority 2: C×C independent modifier
- Priority 3: Evening recovery (after 9pm, weekdays only) — Lean On/Watch For only, context line stays
- Priority 4: Archetype × Tier
- Priority 5: Tier fallback

Key change: Sunday evening override becomes highest priority (no longer gated behind coach insights). Evening weekday override moves below C×C in the cascade.

### Change 3: Expand Pattern Recognition to All Tiers + Outcomes + C×C

**Current:** `getPatternOverride` only triggers for `overwhelmed`, `drained`, `scattered` (low states only).

**New:** Expand to check:
- **Tier patterns** (3+ consecutive days at same tier): depleted, managing, strong, peak — each with its own override statement
- **Outcome patterns** (3+ consecutive days at same outcome): overwhelmed, drained, scattered, steady, focused — each with its own override statement  
- **C×C patterns** (3+ consecutive days of low clarity OR low confidence): requires adding `clarity_level` and `confidence_level` to the check-in query (line 592)

The check-in query needs to fetch `clarity_level`, `confidence_level`, and will need the tier (which isn't stored in daily_checkins — we'll derive from outcome or use the energy state). Since tier isn't in daily_checkins, we'll focus on outcome and C×C patterns. The tier pattern override statements from the spec will map to outcomes that correlate with those tiers.

**Updated query:** Add `clarity_level, confidence_level` to the select on line 592.

### Change 4: "Strength Without Clarity" Override — Independent Signals

**Current (line 615):** `avgCC <= 2.0` with averaging.

**New:** Trigger when `clarityLevel <= 2 OR confidenceLevel <= 2` (independent check, matching Layer 2 approach). Only for strong/peak tier.

### Summary of file changes

**Single file:** `supabase/functions/compute-outer-readiness/index.ts`

1. **Query** (lines 583-596): Add `created_at` to coach insights select, add `clarity_level, confidence_level` to check-ins select
2. **`getPatternOverride`** (lines 494-523): Rewrite to support all outcomes + C×C patterns with new override statements
3. **`getLeanOnWatchFor`** (lines 421-492): Restructure priority cascade with Sunday Priority 0, coach recency check, evening weekday as Priority 3
4. **"Strength without clarity"** (line 615): Change from avg to independent signal check
5. **Deploy** the updated edge function

