

# Card 4 — Your Performance Rhythm: Qualitative Insight Redesign

## What This Changes

The current Performance Rhythm card stacks three independent client-side components (`CauseEffectInsights`, `EnergyRhythm`, `CalendarStateCorrelations`) each running their own DB queries and rendering lists/tables. This redesign replaces all three with a single server-side edge function that triangulates Inner Readiness composite scores (`energy_balance`) with calendar and behavior data to produce **qualitative context sentences** and a pre-computed heatmap grid.

---

## Architecture

```text
daily_checkins (30d) ──┐
                       ├── performance-rhythm-insights edge function ──> display-ready JSON
calendar_events (30d) ─┤
behavior_logs (30d) ───┘
calendar_connections ──┘
```

The client receives a single JSON object and renders it. No proprietary correlation logic runs in the browser.

---

## Edge Function: `performance-rhythm-insights`

**Auth**: Auth0 token verification via `/userinfo` (same pattern as all other edge functions). Service role key for DB reads.

**What it queries (30 days)**:
- `daily_checkins` — `outcome`, `energy_balance` (0-100 composite score), `checkin_date`, `created_at` (time-of-day)
- `calendar_events` — event titles matched against high-stakes keywords
- `calendar_connections` — whether calendar is connected
- `behavior_logs` — `behavior_type`, `created_at`

**What it computes**:

1. **Heatmap grid (3x7)** — Morning/Afternoon/Evening x Mon-Sun
   - Primary: most recent check-in outcome per cell (color)
   - Secondary: average `energy_balance` per cell across 30 days (numeric overlay)
   - Divergence flag: cells where felt state is "focused" but energy_balance < 50 (Managing tier)

2. **Best performance window** — the cell with the highest average composite score. Returns a sentence like "Your sharpest window this month has been Tuesday mornings."

3. **Calendar pattern observations** (max 2)
   - Keywords: board, quarterly, investor, pitch, review, presentation, interview, deadline, client, all-hands, performance, budget, strategy, executive, stakeholder
   - For each keyword found in calendar events on check-in days, compute average `energy_balance` on those days vs overall 30-day average
   - If delta is significant (10+ points), produce: "On days with [keyword] events, your Inner Readiness tends to be [X points lower/higher] than your average -- observed across [N] days."
   - Falls back to the existing outcome-correlation approach (keyword to most common outcome) if energy_balance data is sparse

4. **Behavior-state observation** (max 1)
   - From `behavior_logs` + `daily_checkins`: 0-1 day temporal window
   - Group by (behavior_type to outcome). Filter: total >= 2, confidence >= 0.5
   - Top pattern as sentence: "On days following [behaviour], you tend to check in [state] [X]% of the time."

**Response shape**:
```json
{
  "heatmap": {
    "morning": { "Mon": { "outcome": "focused", "avgScore": 72, "divergence": false }, ... },
    "afternoon": { ... },
    "evening": { ... }
  },
  "bestWindow": "Tuesday mornings",
  "observations": [
    "On days with Board events, your Inner Readiness tends to be 14 points lower than your average -- observed across 5 days.",
    "On days following Avoided behaviors, you tend to check in scattered 70% of the time."
  ],
  "hasCalendar": true,
  "checkInCount": 12
}
```

---

## New Component: `PerformanceRhythmCard.tsx`

Replaces the current inline rendering of three components. Calls the edge function on mount and renders:

1. **Qualitative observation box** (top of card) — max 2 sentences from `observations[]`, styled as a subtle insight panel. If no observations available, shows progressive prompt.

2. **3x7 heatmap grid** — same visual structure as current `EnergyRhythm` but with:
   - Composite score number overlaid in each cell (small text)
   - Divergence indicator (subtle border pulse) on cells where felt state diverges from composite score

3. **Best performance window** — single line beneath the heatmap

4. **Progressive states**:
   - 0 check-ins: "Complete your first check-in to start mapping your rhythm"
   - 1-4: Shows heatmap with progressive message
   - 5+: Calendar observations appear (if calendar connected)
   - No calendar: "Connect your calendar to see how your outer world affects your inner state"

---

## Changes to `Insights.tsx`

- Remove imports: `EnergyRhythm`, `CalendarStateCorrelations`, `CauseEffectInsights`
- Remove client-side data passed to these components (`checkInsWithTimestamp` no longer needed for this card)
- Replace the Card 4 section (lines 779-815) with a single `<PerformanceRhythmCard userId={user?.id} />` call
- The `checkInsWithTimestamp` state and its fetching in `fetchInsightsData` can be simplified (it was primarily used by `EnergyRhythm`)

---

## Files Created/Modified

| File | Action |
|---|---|
| `supabase/functions/performance-rhythm-insights/index.ts` | New edge function with all computation logic |
| `src/components/insights/PerformanceRhythmCard.tsx` | New unified renderer |
| `src/pages/Insights.tsx` | Swap three components for `PerformanceRhythmCard`, clean up state |
| `supabase/config.toml` | Add `[functions.performance-rhythm-insights]` with `verify_jwt = false` |

---

## Security

All correlation logic (calendar keyword matching, behavior-outcome grouping, divergence detection) moves server-side. The client renders pre-computed strings and a grid object. No proprietary scoring visible in the browser bundle.

The existing `CauseEffectInsights.tsx`, `CalendarStateCorrelations.tsx`, and `EnergyRhythm.tsx` files are retained in the codebase but no longer imported on the Insights page.
