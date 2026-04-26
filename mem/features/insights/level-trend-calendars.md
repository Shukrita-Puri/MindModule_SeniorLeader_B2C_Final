---
name: Insights Level Trend Calendars
description: Clarity/Sharpness/Confidence trend calendars under Mind Readiness Rhythm — palette, scale, layout, and rename rules
type: feature
---

# Mind Readiness Rhythm — Trend Calendars

Section title: **Mind Readiness Rhythm** (was "Your Readiness Rhythm").

Four calendars, in this order, all sharing one visual language:
1. **Energy Trend** (was "Mental Energy Trend") — outcome-based dots from `daily_checkins.outcome`.
2. **Clarity Trend** — `daily_checkins.clarity_level`.
3. **Sharpness Trend** (was "Mental Sharpness Trend") — `daily_checkins.mental_sharpness_level`.
4. **Confidence Trend** — `daily_checkins.confidence_level`.

Then **How You Show Up** below all four.

## Data scale
Clarity / Sharpness / Confidence levels are **1–5** in the DB (slider on `/checkin/detail`), NOT 1–10. Tier mapping must use 1–5.

## Canonical palette (locked to daily check-in outcomes)
| Level | Outcome equivalent | Tier label | Color | Darken (gradient end) |
|------:|--------------------|-----------|-------|----------------------|
| 5 | Focused | Peak | `#3d6fa8` | `#2f5685` |
| 4 | Steady | Strong | `#7ba87a` | `#5f8a5e` |
| 3 | Scattered | Steady | `#d4b75a` | `#b89a3f` |
| 2 | Drained | Low | `#e88a52` | `#c76d38` |
| 1 | Overloaded | Depleted | `#d8553f` | `#b03d2a` |

Dot fill: `linear-gradient(135deg, color, dark)`. Glow: `boxShadow: 0 2px 6px rgba(color, 0.35)`. Same palette is used by Energy Trend (mapped via outcome → level equivalent), DailyCheckIn outcome buttons, and the three Level calendars.

## Layout (parity with Energy Trend)
- **Full current calendar month** (day 1 → last day of month), matching Energy Trend's range exactly. Future days in the month render as dashed-empty cells so the user always sees the "remaining days/weeks" of the month.
- Single horizontally scrollable strip; auto-scroll to current week's Monday on mount.
- Mobile: equal-width columns (`clientWidth / 7`); desktop: 26px columns + 4px gap.
- Fixed left labels: Morning · Midday · Evening (`afternoon` time_window → `midday` slot).
- Legend below each calendar uses **per-trend slider vocabulary** (see below), rendered Peak→Depleted left→right.
- Scroll hint above strip: `← scroll for past weeks`.
- Width pinning is done via a **ref callback** (`setScrollRef → applyLayout`) that re-runs on every render, plus a `ResizeObserver` on the scroll container — this is **self-healing** against the 0-width race that previously collapsed sibling calendars when the Patterns tab first became visible. Do NOT revert to a one-shot `useEffect` width-pin.

## Per-trend vocabulary (mirrors `/check-in-detail` sliders, `src/pages/CheckInDetail.tsx:40-42`)

Same 5-tier palette across all three; only the labels change.

| Level | Sharpness | Clarity   | Confidence |
|------:|-----------|-----------|------------|
| 5     | Peak      | Crystal   | Unshakable |
| 4     | Acute     | Lucid     | Certain    |
| 3     | Stable    | Neutral   | Poised     |
| 2     | Dull      | Obscured  | Uncertain  |
| 1     | Depleted  | Clouded   | Reactive   |

`<LevelTrendCalendar>` accepts an optional `vocabulary={{5,4,3,2,1}}` prop — used for both the legend and the dot tooltip. Energy Trend keeps its own outcome vocabulary (Overloaded/Drained/Scattered/Steady/Focused).

## Files
- `src/components/insights/LevelTrendCalendar.tsx` — generic 1–5 calendar.
- `src/components/insights/PerformanceRhythmCard.tsx` — owns Energy Trend + the three `<LevelTrendCalendar>` instances + section title.

## No backend changes
All data comes from existing `daily_checkins` columns. No migrations.

## Production data path (Auth0 + RLS)
The three Level calendars MUST fetch via the **`level-trend-calendar` Edge
Function** in production. Direct client queries against `daily_checkins`
return zero rows under Auth0 because `auth.uid()` is NULL and the SELECT
RLS policy is `((auth.uid())::text = user_id)`. The Edge Function verifies
the Auth0 JWT (`verifyAuth0JWT`) and reads with the service role, mirroring
the Energy Trend pattern in `performance-rhythm-insights`.

Body contract: `{ field: 'clarity_level' | 'mental_sharpness_level' | 'confidence_level', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }`. `field` is whitelisted server-side; `user_id` is **never** read from the client body.

DEV_MODE keeps a direct client query (`.eq('user_id', DEV_USER.id)`) so local dev stays fast. Do NOT remove the DEV_MODE branch and do NOT loosen the RLS policy — the Edge Function is the long-term contract.

## Mind Rhythm Patterns (How You Show Up) contract

The **"How You Show Up"** block under *Mind Readiness Rhythm* is a **pure rhythm-pattern reader** of the four trend calendars above (Energy, Clarity, Sharpness, Confidence). It answers two questions only:

1. **When** is the user most/least energetic, clear, sharp, or confident? (time-of-day × day-of-week)
2. **Which** of those are real **patterns** (consecutive days/weeks/months)?

### Sole data source
`daily_checkins` rows for the last ~30 days, mined into four parallel series:

| Series | Source column | Positive band | Negative band |
|---|---|---|---|
| Energy | `outcome` | `focused`, `steady` | `drained`, `overwhelmed` |
| Clarity | `clarity_level` | `4–5` | `1–2` |
| Sharpness | `mental_sharpness_level` | `4–5` | `1–2` |
| Confidence | `confidence_level` | `4–5` | `1–2` |

### Forbidden inputs
The following signals **must never** appear in *How You Show Up* — they belong to other cards:
- Coach messages, sessions, JIT prep, or any `coach_*` table
- `behavior_logs`, ritual completions, calendar events, wearable/HRV data
- Any "X% positive check-in rate" stat (this lives in **Trajectory → Consistency**)
- `causeEffectInsight` (stays under *Calendar Pattern*, not here)

### Output contract (`performance-rhythm-insights` → `mindRhythmPatterns`)
```ts
mindRhythmPatterns: {
  energy:     RhythmFinding[];   // cap 2
  clarity:    RhythmFinding[];   // cap 2
  sharpness:  RhythmFinding[];   // cap 2
  confidence: RhythmFinding[];   // cap 2
} | null;                         // total cap across all dimensions: 6

interface RhythmFinding {
  kind: 'peak-window' | 'low-window' | 'peak-day' | 'low-day' | 'consecutive' | 'cell-peak';
  text: string;
  confidence: number;   // 0–1, used for ordering
  observations: number;
}
```

### Honesty gates (no fabrication)
- ≥7 non-null observations per series before any window/day finding fires
- ≥3 obs per time-window with ≥20pp gap for `peak-window`/`low-window`
- ≥2 obs per day with ≥30pp gap for `peak-day`/`low-day`
- ≥3 consecutive same-DOW occurrences for `consecutive`
- ≥2 obs per (DOW × window) cell with ≥30pp above user mean for `cell-peak`
- Empty sub-sections render as **nothing** — no "building pattern data…" filler.

### Consistency stat (Trajectory, not How You Show Up)
`state-patterns-insights` returns `positiveRate: { pct, n } | null` — % of check-ins in `{focused, steady}` over 30d. Rendered as the **Consistency** row in `LeadershipPatternsCard.tsx`, beneath Friction, gated at ≥5 check-ins. It is the mirror of Friction at the check-in level. Do NOT surface it in *How You Show Up*.
