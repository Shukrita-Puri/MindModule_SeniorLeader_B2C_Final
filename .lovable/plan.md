

# Plan: Confidence-Tiered HRV Baseline (by Data Density)

## Current Problem
- `getUserHRVBaseline` returns an average from even 1 data point with no confidence signal
- `compute-inner-readiness` gives wearable 25-35% weight regardless of whether baseline is derived from 1 day or 30
- `computeHRVPatternContext` gates pattern observations at `total >= 7` but doesn't communicate confidence downstream
- No mechanism to scale wearable influence based on how trustworthy the baseline actually is

## Confidence Tiers (by unique days with HRV data)

| Days with data | Confidence | Wearable weight | Rationale |
|---|---|---|---|
| 1-6 days | `low` | ~15% | Baseline is directional only; not enough to detect real deviation |
| 7-14 days | `medium` | ~25% | Minimum viable baseline per HRV research; deviation detection starts working |
| 15+ days | `high` | Full 25-35% | Stable baseline; patterns and divergence are trustworthy |

This is standard in HRV science — 7 days is the accepted minimum for a meaningful baseline. Below that, individual readings carry too much noise.

## Changes (3 files)

### 1. `src/utils/wearableContextAnalyzer.ts`
- Add `baselineConfidence: 'low' | 'medium' | 'high'` and `sampleDays: number` to `HRVPatternContext`
- Compute confidence from unique days count: `<7 → low`, `7-14 → medium`, `15+ → high`
- Lower pattern observation gate from `total >= 7` to `total >= 3` (partial patterns still useful)
- Lower per-weekday gate from 3 to 2
- Return `sampleDays` so downstream consumers and Layer 3 text can reference it

### 2. `src/utils/energyStateEngine.ts`
- Extract `baselineConfidence` and `sampleDays` from `hrvPatternContext`
- Pass both to `compute-inner-readiness` in the request body

### 3. `supabase/functions/compute-inner-readiness/index.ts`
- Accept `baselineConfidence` and `sampleDays` in request body
- Scale wearable weight by confidence:
  - `low`: wearable gets 15% (down from 25-35%), redistributed to felt state and circadian
  - `medium`: wearable gets 25% (current aligned weight)
  - `high`: wearable gets full 25-35% (current behavior)
- In Layer 3 text, note data density when confidence is low: "Based on X days of HRV data" vs "Based on your 30-day baseline"
- Pattern observations only surface at medium+ confidence

## What stays the same
- `getUserHRVBaseline` logic unchanged (still averages whatever exists)
- DB schema unchanged
- Sync pipeline unchanged
- Tier thresholds unchanged
- Divergence detection thresholds unchanged (>30 gap)

