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
- Trailing ~30 days, snapped to whole weeks (Mon→Sun).
- Single horizontally scrollable strip; auto-scroll to current week's Monday on mount.
- Mobile: equal-width columns (`clientWidth / 7`); desktop: 26px columns + 4px gap.
- Fixed left labels: Morning · Midday · Evening (`afternoon` time_window → `midday` slot).
- Legend below each calendar: Depleted · Low · Steady · Strong · Peak (left→right rendered Peak→Depleted).
- Scroll hint above strip: `← scroll for past weeks`.

## Files
- `src/components/insights/LevelTrendCalendar.tsx` — generic 1–5 calendar.
- `src/components/insights/PerformanceRhythmCard.tsx` — owns Energy Trend + the three `<LevelTrendCalendar>` instances + section title.

## No backend changes
All data comes from existing `daily_checkins` columns. No migrations.
