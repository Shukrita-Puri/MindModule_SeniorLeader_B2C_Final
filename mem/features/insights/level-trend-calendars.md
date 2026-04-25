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
