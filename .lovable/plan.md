
## Goal

Make **"How You Show Up"** (under *Mind Readiness Rhythm*) a **pure rhythm-pattern reader** of the four trend calendars — Energy, Clarity, Sharpness, Confidence — answering only:

- **When** is the user most/least **energetic / clear / sharp / confident**? (time-of-day × day-of-week)
- **Which** of those are real **patterns** (consecutive days/weeks/months)?

…and move the *"positive check-in rate"* stat to the **Trajectory** scorecard, where archetype + Performance Readiness Score + Friction already live.

## Root cause of the current drift

`supabase/functions/performance-rhythm-insights/index.ts` builds *How You Show Up* (`presenceLabel` + `presenceInsight` + `presenceActions` + `temporalPatterns` + `causeEffectInsight`) by mixing **six different signal classes**:

1. Pre-event ritual completion vs high-stakes calendar events (lines 670–675)
2. Coach-message keyword scans for "presence" language (lines 685–691)
3. Wearable readiness deltas around high-stakes events (lines 693–702)
4. **Overall positive check-in rate** (lines 718–721, 743) — *belongs in Trajectory*
5. JIT prep correlations + behaviour→outcome (`causeEffectInsight`, lines 407–461) — *cross-feature, not rhythm*
6. Day-of-week / time-of-day temporal patterns (lines 778–904) — *the only rhythm-native logic*

It also only reads `daily_checkins.outcome`. The three new trends (`clarity_level`, `mental_sharpness_level`, `confidence_level`) are **never fed into the pattern miner**, so they can never produce "Tuesday afternoons are your sharpest window" type insights.

## Plan

### 1. Edge function: `supabase/functions/performance-rhythm-insights/index.ts`

**Drop from rhythm output:**
- The entire `presenceScore` / pre-event / coach-keyword / energized / depleted-high-stakes scoring block (lines ~652–776).
- `causeEffectInsight` from the *How You Show Up* payload (it stays computed for *Calendar Pattern*, but we will not echo it under presence — see step 2).
- The `Your overall positive check-in rate is X%…` signal text.

**Add a unified rhythm miner** that runs over **four parallel series** drawn from `daily_checkins`:

| Series | Source column | Positive band | Negative band |
|---|---|---|---|
| Energy | `outcome` | `focused`, `steady` | `drained`, `overwhelmed` |
| Clarity | `clarity_level` | `4–5` | `1–2` |
| Sharpness | `mental_sharpness_level` | `4–5` | `1–2` |
| Confidence | `confidence_level` | `4–5` | `1–2` |

For each series, derive (gated at ≥7 data points per series):

- **Strongest / weakest time-window** (morning/midday/evening) when ≥3 obs per window and ≥20 pp gap.
- **Strongest / weakest day-of-week** when ≥2 obs per day and ≥30 pp gap.
- **Consecutive-run patterns**: ≥3 consecutive same-DOW occurrences in the positive *or* negative band → `"3+ consecutive Tuesday mornings you've checked in 'sharp' (4–5)."`
- **Best (DOW × time-window) cell** when count ≥2 and ≥30 pp above the user's mean.

Return as a new field on the response:

```ts
mindRhythmPatterns: {
  energy:     RhythmFinding[];
  clarity:    RhythmFinding[];
  sharpness:  RhythmFinding[];
  confidence: RhythmFinding[];
} | null;

interface RhythmFinding {
  kind: 'peak-window' | 'low-window' | 'peak-day' | 'low-day' | 'consecutive' | 'cell-peak';
  text: string;        // e.g. "Afternoons are your sharpest window (78% strong vs 41% mornings)."
  confidence: number;  // 0–1, used for ordering
  observations: number;
}
```

Order findings within each dimension by `confidence` desc, dedupe overlapping wording, cap at 2 per dimension and 6 total.

**Add positive-rate stat for Trajectory** (separate field, no longer in presence text):

```ts
positiveRate: { pct: number; n: number } | null;
```

Computed as `outcome ∈ {focused, steady}` over the full 30-day window; `null` until ≥5 check-ins.

**Strip from response**: `presenceScore`, `presenceLabel`, `presenceInsight`, `presenceActions`. Keep `temporalPatterns` only as legacy noop (return `null`) so client falls through cleanly.

### 2. Client: `src/components/insights/PerformanceRhythmCard.tsx`

- Replace the current "How You Show Up" block (lines 1051–1091) with a new **Mind Rhythm Patterns** block, only when `data.mindRhythmPatterns` has at least one finding across any dimension.
- Render as 4 collapsible-style sub-sections (Energy / Clarity / Sharpness / Confidence), each showing up to 2 findings in muted-foreground bullet form, with the same icon + chip styling as today.
- Skip a sub-section entirely when its array is empty (honest blanks).
- Header copy: keep the section heading **"How You Show Up"**, sub-explanation: *"When you're most and least energetic, clear, sharp, and confident — drawn only from your check-in trends above."*
- Remove the DEV-mode duplicate of the presence-score logic (lines ~666–796) and replace with the same edge-function-driven `mindRhythmPatterns` field; DEV mode keeps its existing direct-query pathway but for the *new* miner.
- Drop `causeEffectInsight` and `presenceActions` from this block (they remain available elsewhere — Calendar Pattern still renders `calendarInsight`).

### 3. Trajectory scorecard: `src/components/insights/LeadershipPatternsCard.tsx`

Add a **fourth row** under Friction:

```
Consistency        37% positive   ↗︎
```

- Label: **Consistency** (renamed from "positive check-in rate" per request — neutral, executive-friendly).
- Source: `positiveRate` from `state-patterns-insights` (cheaper than re-fetching from rhythm function — the same friction calc already runs there). If easier, expose `positiveRate = 100 − frictionPct` directly in `state-patterns-insights` response and read it from `prefetchedData`.
- Trend arrow: reuse the existing `trendDirection` field (inverse of friction trend).
- `InsightInfoModal`: *"How often you check in 'focused' or 'steady' over the last 30 days. The mirror of Friction — a higher number means more consistent positive states."*
- Hidden when `checkInCount < 5` (matches existing progressive-message gate).

### 4. Memory update: `mem/features/insights/level-trend-calendars.md`

Append a new section **"Mind Rhythm Patterns (How You Show Up) contract"** documenting:
- The four-series rhythm miner is the *only* source of insight text in this block.
- Forbidden inputs: coach messages, behavior_logs, calendar events, rituals, wearable data — those belong to other cards.
- Positive-rate stat lives in Trajectory, never in How You Show Up.
- Per-dimension cap of 2 findings, total cap of 6.

## Files to edit

- `supabase/functions/performance-rhythm-insights/index.ts` — replace presence block, add `mindRhythmPatterns` + `positiveRate`.
- `supabase/functions/state-patterns-insights/index.ts` — expose `positiveRate` (mirrors existing friction calc).
- `src/components/insights/PerformanceRhythmCard.tsx` — swap presence renderer for rhythm-patterns renderer; drop DEV-mode presence branch.
- `src/components/insights/LeadershipPatternsCard.tsx` — add Consistency row to scorecard.
- `mem/features/insights/level-trend-calendars.md` — document the contract.

## Honesty / no-fabrication guarantees

- Every finding is gated by minimum observation counts (≥7 per series for windows/days, ≥3 for consecutive runs, ≥2 per cell).
- Empty sub-sections render as nothing (no "building pattern data…" filler) — consistent with the existing "blanks are honest" rule for the trend dots.
- No backfill, no synthesised data: clarity / sharpness / confidence findings only appear once those columns have enough non-null history.

## Validation after implementation

1. Confirm `state-patterns-insights` returns `positiveRate.pct` matching `100 − frictionPct` for an active user.
2. Confirm `performance-rhythm-insights` returns `mindRhythmPatterns` with at least an `energy` array for any user with ≥7 outcomes, and that `clarity/sharpness/confidence` arrays only populate once those columns have ≥7 non-null rows.
3. Verify in the UI that *How You Show Up* no longer mentions coach sessions, JIT, or any "X% positive" language, and that Trajectory now shows a Consistency row beneath Friction.
