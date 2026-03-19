

# Plan: Calendar×HRV Cause-Effect Path + HRV in JIT Path

## Overview

Add a new top-priority **Path A** that correlates calendar event types with HRV readings, showing users which events impact their physiology. Shift existing paths down (A→B, B→C, C→D, D→E, E→F). Enrich the JIT path (now Path E) with HRV data. Update client-side DEV_MODE code to mirror all paths.

---

## Data Available

The `wearable_data` table contains `user_id`, `summary_date`, `hrv` (numeric), `resting_heart_rate`, plus quality flags. The `calendar_events` table has `title`, `start_time`. The existing `EVENT_TYPE_KEYWORDS` map classifies events into 10 canonical types. Both tables are already queried in the edge function (wearable_data is NOT currently queried — needs adding).

---

## Changes

### 1. Edge Function (`supabase/functions/performance-rhythm-insights/index.ts`)

**Add wearable_data to parallel fetch** (line 83-101):
- Add query: `wearable_data` table, selecting `summary_date, hrv, resting_heart_rate` for user, last 30 days, where `hrv IS NOT NULL`

**New Path A — Calendar Event Type × HRV Correlation** (insert before current Path A at line 223):
- For each calendar event with a classified type, find same-day HRV from `wearable_data`
- Group by event type → collect HRV readings
- Calculate per-type average HRV and compare to user's overall 30-day HRV baseline
- Threshold: event type needs ≥2 occurrences AND ≥10% deviation from baseline
- Output examples:
  - "Board meetings correlate with a 22% HRV drop (avg 38ms vs your baseline 49ms) — observed across 4 events."
  - "1:1 sessions correlate with stable HRV (avg 52ms vs baseline 49ms) — these events don't tax your nervous system."
- Include the actual event title of the most recent occurrence for specificity

**Shift existing paths**: A→B, B→C, C→D, D→E, E→F (just renaming in comments, adding `!causeEffectInsight &&` gates remain unchanged)

**Enrich Path E (formerly D) — JIT Prep × HRV**:
- After finding JIT-completed events, also look up same-day HRV from `wearable_data`
- If HRV data exists for ≥2 JIT-completed events, compare avg HRV on JIT-prepped days vs non-prepped event days
- Enhanced output: "When you completed JIT prep, your HRV averaged 52ms vs 38ms on unprepped event days — preparation may reduce physiological stress."
- Falls back to existing check-in-only logic if no HRV data

### 2. Client-Side DEV_MODE (`src/components/insights/PerformanceRhythmCard.tsx`)

**Add wearable_data fetch** to the DEV_MODE parallel query block (line 92-130):
- Query `wearable_data` for `summary_date, hrv` where `hrv` is not null

**Add all 6 cause-effect paths** (A through F) to the DEV_MODE block, replacing the current single-path logic (lines 273-305):
- Path A: Calendar×HRV (same logic as edge function)
- Path B: Behavior→Check-in (current Path A logic, threshold stays at ≥2, conf ≥0.4)
- Path C: Calendar event→Check-in
- Path D: Event day vs non-event day
- Path E: JIT prep→outcome + HRV enrichment
- Path F: Temporal fallback (weekday/weekend, morning/evening)

**Auth user path**: No changes needed — production users already call the edge function which handles everything server-side.

### 3. JIT Preferences fetch in DEV_MODE

The DEV_MODE block currently does NOT fetch `jit_preferences`. Add it to the parallel query so Paths E works client-side.

---

## Path Priority Order (final)

| Path | Trigger | Data Required | Output Focus |
|------|---------|--------------|--------------|
| **A** | Calendar Event × HRV | `calendar_events` ≥3 + `wearable_data` HRV ≥5 days | Which event types move your HRV |
| **B** | Behavior → Check-in | `behavior_logs` ≥2 + `daily_checkins` | Coach sessions / practices → state |
| **C** | Calendar Event → Check-in | Calendar ≥3 events + checkins ≥5 | Event type → next-day state |
| **D** | Event Day vs Non-Event Day | Calendar ≥2 + checkins ≥5 | Structure vs space |
| **E** | JIT Prep → Outcome + HRV | `jit_preferences` ≥2 + checkins ≥5 | Prep impact on state + physiology |
| **F** | Temporal Fallback | Checkins ≥7 | Weekday/weekend or morning/evening |

---

## Files Changed

| File | Change |
|------|--------|
| `performance-rhythm-insights/index.ts` | Add `wearable_data` query, new Path A (Calendar×HRV), enrich Path E (JIT+HRV), shift path letters |
| `PerformanceRhythmCard.tsx` | Add `wearable_data` + `jit_preferences` to DEV_MODE queries, mirror all 6 paths client-side |

No DB migrations. Edge function redeploy required.

