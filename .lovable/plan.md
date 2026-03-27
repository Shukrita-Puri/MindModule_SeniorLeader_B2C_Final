

# Insights Page: 6 Remaining Bugs

## Bug 1: Coach Statements Still in Win Ledger (Stale Data)

**Root cause:** The code fix (filtering to `sender_type === 'user'`) was deployed correctly in all 3 edge functions. However, the problematic wins were extracted on **March 19** — before the fix was deployed. The rows are stale DB data, not new extractions.

**Fix:** Database migration to deactivate the coach-originated wins that clearly contain coach observations. Query the `dialogue_messages` table for the same `session_id`, check if the `win_content` text appears in an `assistant` message but NOT in any `user` message, and soft-delete (set `analyzed_at = null` and prefix `win_content` with `[DEACTIVATED]`) or hard-delete those rows. For the specific user `google-oauth2|111878424918915566691`, the flagged rows are IDs `faedca71...` and `32f46d11...`.

**Approach:** Create a one-time cleanup migration that deletes `tiny_wins` rows where `win_content` matches known coach-observation patterns (starts with verbs like "observed", "identified that", "User described", "User launched", "The user is ready"). These are third-person phrases a coach would write, not first-person user statements.

**Files:** Database migration only. No code changes — the extraction fix is already deployed.

---

## Bug 2: Secondary Tags (Clarity / Renewal / Recalibration) Not Showing

**Root cause:** Current implementation uses content keyword matching (`/clarity|focused|cut through.../`), but the actual win content rarely contains these exact words. The user's requirement is to use the **same metric definitions from Performance Patterns**:

| Secondary Tag | Performance Patterns metric | Source | 
|---|---|---|
| Recalibration | `energyRegulation` | `energy_balance` from check-ins, pause-in-low-state events |
| Clarity | `focusRecovery` | `clarity_level` from check-ins, flow-under-load events |
| Renewal | `energyRenewal` | `confidence_level` from check-ins, renergise events |

**Fix:** Map secondary tags from the win's **dimension metadata** (already stored on each `tiny_wins` row) rather than content keywords:

- `regulation_level` = `regulated` | `intentional` → **Recalibration** (maps to energyRegulation)
- `agency_type` = `proactive` | `responsive` + content matches focus/clarity → **Clarity** (maps to focusRecovery)  
- `growth_signal` = `resilience` | `letting-go` | `boundary` → **Renewal** (maps to energyRenewal)

This uses the same conceptual framework: Recalibration = how you regulate, Clarity = how you think under load, Renewal = how you recover.

**File:** `src/pages/Insights.tsx` (lines 901-911)

---

## Bug 3: Week at a Glance Still Showing Composite Grid (Auth Users)

**Root cause:** The `performance-rhythm-insights` edge function does **not** return a `weekRows` field. Its response (line 814-828) only includes `grid` (the 3×7 composite). The client checks `data.weekRows ?` at line 984 — since it's undefined for Auth users, it falls back to the composite grid at line 1044.

The DEV_MODE path in `PerformanceRhythmCard.tsx` (lines 720-772) correctly builds `weekRows`, but this logic was never ported to the edge function.

**Fix:** Add the rolling weekly calendar logic (4 weeks: this week → 3 prior, future days greyed) to `performance-rhythm-insights/index.ts`. Mirror the exact logic from the DEV_MODE client path. Return `weekRows` alongside `grid` in the response.

**File:** `supabase/functions/performance-rhythm-insights/index.ts` (add weekRows computation before the return statement at line 814)

---

## Bug 4: How You Show Up — Redundant Temporal Patterns

**Root cause:** The consecutive-day pattern logic generates one entry per day-of-week that has 3+ consecutive same outcomes. So "3 consecutive Thursdays steady" AND "3 consecutive Wednesdays steady" both appear. These say essentially the same thing ("you're consistently steady mid-week").

**Fix:** Deduplicate temporal patterns:
1. If multiple consecutive-day patterns share the same outcome, consolidate into one: e.g., "You consistently check in 'steady' on Wed and Thu (3+ consecutive weeks each)."
2. Cap total temporal patterns rendered in How You Show Up to 2 (currently 4 from the EF, all rendered).
3. Also deduplicate: if the cause-effect insight from Path F (weekday/weekend or morning/evening) says the same thing as a temporal pattern, suppress the duplicate.

**Files:** `supabase/functions/performance-rhythm-insights/index.ts` (temporal pattern dedup logic, lines 721-751), `src/components/insights/PerformanceRhythmCard.tsx` (client-side DEV_MODE mirror + render cap)

---

## Bug 5: HRV × Calendar Not Visible in How You Show Up

**Root cause:** Path A in the EF requires `insightCalendarEvents.length >= 3 && wearableData.length >= 5`. The DEV_MODE client uses lower thresholds (`>= 2` and `>= 3`). If the Auth user's data meets the lower thresholds but not the higher ones, Path A won't fire in production.

Additionally, cause-effect insights from Path A render in section 1C (standalone box) — NOT inside "How You Show Up" — because they don't contain the word "coach". The user expects HRV × Calendar to appear inside How You Show Up.

**Fix:** 
1. Lower EF Path A thresholds to match DEV_MODE: `insightCalendarEvents.length >= 2 && wearableData.length >= 3`
2. Render ALL cause-effect insights inside "How You Show Up" as bullets (not just coach-related ones). Remove the standalone 1C section entirely — it duplicates content and confuses the layout.

**Files:** `supabase/functions/performance-rhythm-insights/index.ts` (line 256, thresholds), `src/components/insights/PerformanceRhythmCard.tsx` (merge 1C into 1A)

---

## Bug 6: Second Stat Box — Dynamic Label

**Root cause:** Currently hardcoded as "With composure" counting `regulation_level: managed/composed` or `primary_emotion: determination/relief`.

**Fix:** Compute the dominant dimension across all wins this month, then use that as the label:

```
Count per dimension:
- Composure: regulation_level = managed/composed
- Clarity: agency_type = proactive/decisive  
- Resilience: growth_signal = resilience/boundary
- Growth: growth_signal = learning/breakthrough

Label = highest count dimension
```

The stat box shows the count and the dynamic label (e.g., "4 WITH CLARITY" or "3 WITH COMPOSURE"). The insight bar text adapts accordingly.

**File:** `src/pages/Insights.tsx` (lines 836-870)

---

## Summary

| # | Bug | Fix | File(s) |
|---|-----|-----|---------|
| 1 | Stale coach wins in DB | Migration to delete coach-observation rows | DB migration |
| 2 | Secondary tags not showing | Map from dimension metadata, not content keywords | `Insights.tsx` |
| 3 | Composite heatmap for Auth users | Add weekRows to `performance-rhythm-insights` EF | `performance-rhythm-insights/index.ts` |
| 4 | Redundant temporal patterns | Consolidate same-outcome consecutive patterns | `performance-rhythm-insights/index.ts`, `PerformanceRhythmCard.tsx` |
| 5 | HRV × Calendar not visible | Lower EF thresholds + merge 1C into 1A | `performance-rhythm-insights/index.ts`, `PerformanceRhythmCard.tsx` |
| 6 | Static "With composure" label | Dynamic label from dominant dimension | `Insights.tsx` |

