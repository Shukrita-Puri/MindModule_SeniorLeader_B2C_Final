---
name: Insights Level Trend Calendars
description: Energy/Clarity/Sharpness/Confidence trend calendars under Mind Readiness Trend — tab switcher, monthly streak wreaths, palette, and layout rules
type: feature
---

# Mind Readiness Trend — Trend Calendars

Section title: **Mind Readiness Trend** (was "Mind Readiness Rhythm" / "Your Readiness Rhythm").

Four trend calendars, all sharing one visual language, surfaced via a **tab switcher** under the section header — only **one chart at a time** is visible (mirrors the Cause & Effect card pattern):

`[ Energy ] [ Clarity ] [ Sharpness ] [ Confidence ]` — Energy is the default tab.

Sources:
1. **Energy Trend** — `daily_checkins.outcome`.
2. **Clarity Trend** — `daily_checkins.clarity_level`.
3. **Sharpness Trend** — `daily_checkins.mental_sharpness_level`.
4. **Confidence Trend** — `daily_checkins.confidence_level`.

Then **Your Rhythm Signals** below the active calendar.

## Per-chart header (3-zone)
`[ Title (info) ]   ← scroll for past weeks   [ StreakFlame ]`
- The "scroll for past weeks" hint sits centred next to the title (was on the right).
- An engraved coloured-flame streak icon (`src/components/insights/StreakWreath.tsx`, exported as `StreakWreath` for backwards-compat) sits on the extreme right of every chart header. The streak number is rendered inside the flame's inner core.

## Streak rules (UI-only, no new queries)
Derived from the same `daily_checkins` rows the calendar already loads.
- **Window:** current calendar month only. Resets to 0 on day 1 of every month.
- **Day grain:** a day counts as positive if **any** check-in slot that day meets the positive band.
- **Anchor:** consecutive positive days ending **today** — or **yesterday** if today has no entry yet (so the streak doesn't visually break mid-day).
- **Gap rule:** any in-month day that is non-positive *or* has no check-in ends the streak.
- Positive bands: Energy → `outcome ∈ {focused, steady}`; Clarity / Sharpness / Confidence → `level ≥ 4`.
- Milestone celebrations at **3 / 7 / 14 / 21 / 30** days play a one-shot 1.2s gold pulse + sparkle (CSS `streak-pulse` keyframe in `src/index.css`). No toasts, no confetti.

## Streak Flame component
- Hand-drawn engraved flame in the 19th-century scientific-engraving language (see `mem://brand/reset-studio-visual-system`). Do NOT revert to the laurel wreath.
- Warm amber/gold gradient body (`#f4c14a → #e8a23a → #c9651f`), thin `hsl(var(--gold))` outline, sparse hatch lines for engraving texture, cream inner core that holds the streak number, single saffron tip wisp.
- Transparent background, no drop-shadow. Caption below uses per-trend copy: `days of high energy` / `days of crystal clarity` / `days of peak sharpness` / `days of strong confidence`. Empty streak (`0`) renders the flame at 35% opacity with a `—` and caption `start your streak`.
- Milestone (3/7/14/21/30) plays the `animate-streak-pulse` keyframe plus a one-shot ember sparkle above the flame tip.

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

The **"Your Rhythm Signals"** block (formerly *How You Show Up*) under *Mind Readiness Rhythm* is a **pure rhythm-pattern reader** of the four trend calendars above (Energy, Clarity, Sharpness, Confidence). It answers two questions only:

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
  topThree: RhythmFinding[];   // exactly what the app shows (≤3, prioritised)
  all:      RhythmFinding[];   // full ranked set — reserved for the weekly insights email
} | null;

interface RhythmFinding {
  kind: 'peak-window' | 'low-window' | 'peak-day' | 'low-day' |
        'consecutive-neg' | 'consecutive-pos' | 'cell-peak';
  dimension: 'energy' | 'clarity' | 'sharpness' | 'confidence';
  text: string;        // crisp, ≤110 chars — for the app
  longText: string;    // verbose with stats — for the weekly email
  confidence: number;  // 0–1, statistical strength
  observations: number;
  priorityScore: number; // chief-of-staff rank (higher wins)
}
```

### App rendering rules
- Render **`topThree` only** as a single flat list — **no per-dimension sub-headers**.
- Section title: **"Your Rhythm Signals"**. Never revert to "How You Show Up".
- Each bullet ends with an inline dimension tag (`· Energy` / `· Clarity` / `· Sharpness` / `· Confidence`) in 10px uppercase muted text — never a section break.
- Empty state at ≥7 check-ins but 0 findings: *"Patterns will sharpen as your check-ins accumulate across more days and times."* No filler bullets.

### Chief-of-Staff prioritisation (which 3 win)
`priorityScore = KIND_WEIGHT + (confidence × 0.3) + DIMENSION_BONUS`

| Kind | Weight | Why |
|---|---|---|
| `consecutive-neg` | 1.0 | Active risk — recurring drop the user can act on this week |
| `cell-peak`       | 0.8 | Concrete day×time to protect for high-stakes work |
| `low-day`         | 0.7 | Recurring trough — avoid scheduling here |
| `peak-window`     | 0.5 | Useful but generic |
| `low-window`      | 0.5 | Same |
| `peak-day`        | 0.4 | Informational |
| `consecutive-pos` | 0.3 | Celebratory, non-actionable |

Dimension tiebreaker (decision quality first, then fuel, then slow-mover):
`sharpness +0.20 → clarity +0.15 → energy +0.10 → confidence +0.05`.

**Diversity guard while picking the top 3**: at most 2 findings per dimension, at most 2 of the same kind. This stops the user seeing three near-identical "X day peaks". When fewer than 3 strong signals exist, the app shows fewer — never pads with weak ones.

### Long-form vs short-form
The crisp `text` is the only thing the app should render. The verbose `longText` (with %, n, scale labels like `Crystal/Lucid (4–5)`) is reserved for the future **Weekly Insights email**. Do not surface `longText` in-app.

### Honesty gates (no fabrication)
- ≥7 non-null observations per series before any window/day finding fires
- ≥3 obs per time-window with ≥20pp gap for `peak-window`/`low-window`
- ≥2 obs per day with ≥30pp gap for `peak-day`/`low-day`
- ≥3 consecutive same-DOW occurrences for `consecutive`
- ≥2 obs per (DOW × window) cell with ≥30pp above user mean for `cell-peak`
- Empty sub-sections render as **nothing** — no "building pattern data…" filler.

### Consistency stat (Trajectory, not How You Show Up)
`state-patterns-insights` returns `positiveRate: { pct, n } | null` — % of check-ins in `{focused, steady}` over 30d. Rendered as the **Consistency** row in `LeadershipPatternsCard.tsx`, beneath Friction, gated at ≥5 check-ins. It is the mirror of Friction at the check-in level. Do NOT surface it in *How You Show Up*.
