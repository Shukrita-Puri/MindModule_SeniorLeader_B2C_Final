## Insights — revised plan (items 7 & 8 reworked)

Items 1–6 unchanged from the previous plan (remove header title, per-card share, "Your Performance Trajectory" rename, borderless glass rows, drop icons, larger eyebrow with full new card names). This revision only rewrites items 7 and 8.

---

### Item 7 — re-evaluated (no static "today" metric)

The previous "today's value on the right" idea was wrong: each card actually answers a **trend** question, not a "what's my number right now" question. Forcing a single live value would either be noisy (a single check-in moves it wildly) or misleading (e.g. a stress score with no event today).

**New recommendation:** drop the right-side metric entirely on the summary rows. Each row keeps only: large eyebrow, one-line plain-English value sentence already written (e.g. "Operating sharper than baseline · last 7 days"), and the chevron. The detail card is the home of all numbers — the summary row stays calm and CEO-grade, matching Apple Health's "you have to tap in for the data" pattern.

What I will do instead: rewrite each row's `value` sentence into a *signal-bearing one-liner* derived from data already on `statePatterns` / `weekData` / `practiceData` — no new fetches:

| Card | Sentence template (data-driven) |
|---|---|
| Your Performance Trajectory | "{archetypeShortTitle} · {trendDirection} vs baseline" e.g. "Adaptive Navigator · improving" |
| When You Perform Best | "Sharpest on {topDay} {topWindow} · 7-day pattern" |
| What Drains Your Performance | "{highStressDayCount} elevated-load days this week" or "Calendar + wearable still gathering" |
| What Restores Your Performance | "{topCategory} lifted your next check-in most" |

When a sentence cannot be honestly produced (missing data), the row falls back to a neutral descriptor — never a fabricated number. Aligns with the **Data Honesty Standards** memory.

No icon, no border, no right-side metric. The Apple-Health gestalt is preserved by the eyebrow + sentence + chevron.

---

### Item 8 — Readiness & Performance Streaks block (above the four rows)

Two stacked components above the summary stack. The current **Trajectory** summary row is suppressed once this lands (kept in code for re-enable).

```
┌─────────────────────────────────────────────────┐
│             INNER READINESS  · this week        │
│                                                 │
│            ◜◝         ┌──────────┐              │
│          ◜    ◝       │   M T W T │ F S S       │
│         │   72   │    │   ● ● ● ● │ · · ·       │  ← daily marks
│          ◟    ◞                                 │
│             ◟◞                                  │
│        Strong · Recovering · Depleted           │
└─────────────────────────────────────────────────┘

┌──── Peak (cumulative · resets month-end) ─────┐
│  👍 4   Peak Clarity                          │
│  👍 3   In-Control Regulation                 │
│  👍 2   Composed Pressure                     │
└────────────────────────────────────────────────┘
┌──── Friction (cumulative · resets month-end) ─┐
│  👎 5   Overloaded Pressure                   │
│  👎 3   Reactive Regulation                   │
│  👎 2   Clouded Clarity                       │
└────────────────────────────────────────────────┘
```

#### 8a · Inner Readiness Dial (daily · Mon→Sun · resets weekly)

- **Component:** new `src/components/insights/InnerReadinessDial.tsx`.
- **Visual:** semicircular speedometer (SVG). 0–100 scale. Tri-zone arc using the same tokens that drive the homepage hero tier pill (Strong = green, Recovering = amber, Depleted = red — sourced from `outerBrief.innerReadinessTier` mapping in `useOuterReadiness.ts`). A single needle marks today's score. Score number rendered large at center in headline font.
- **Daily strip below dial:** Mon–Sun row of 7 dots. Each dot color = that day's tier (green/amber/red) from the day's `innerReadinessScore`. Today's dot is ringed. Days in the future are hairline outlines only.
- **Data source:** reuse `useOuterReadiness` for today's score + tier. For the M–Sun history, pull from `brief_snapshots` table (already used by the Insights Progress Tab v2 memory) — read-only Supabase query for the last 7 days of `inner_readiness_score`. No new edge function.
- **Reset:** the strip is keyed by ISO week. On Monday 00:00 (user timezone, per `Timezone Persistence` memory) the strip visually resets while the underlying historical rows stay in the DB for the Trajectory detail card.
- **Tap:** routes to `/insights/leadership-patterns` (the now-hidden Trajectory detail) so the data still has a deep-dive home.

#### 8b · Performance Streaks (cumulative this month · resets month-end)

- **Component:** new `src/components/insights/PerformanceStreaks.tsx`.
- Two side-by-side columns inside one glass card: **Peak** (top) and **Friction** (bottom), each with up to 3 rows ordered by count descending.
- Each row: thumbs-up or thumbs-down glyph with the count layered inside (mirrors the "flame with a number" pattern the user likes), plus a label.
- **Dimensions tracked:** Clarity, Emotion, Pressure, Regulation — the four sliders already captured by `daily_checkins` (`clarity_level`, `emotion_level`, `pressure_level`, `regulation_level`).
- **Label rules (CEO register, no wellness tropes):**
  - Peak labels — top quartile of the dimension's monthly distribution:
    - Clarity → "Peak Clarity"
    - Emotion → "Steady Emotion"
    - Pressure → "Composed Pressure"
    - Regulation → "In-Control Regulation"
  - Friction labels — bottom quartile:
    - Clarity → "Clouded Clarity"
    - Emotion → "Volatile Emotion"
    - Pressure → "Overloaded Pressure"
    - Regulation → "Reactive Regulation"
- **Counts:** number of check-ins this calendar month where the dimension fell into the relevant quartile. Quartile boundaries computed against the user's own 30-day baseline (already accessible via existing rhythm-card logic — extracted to `src/utils/dimensionTiers.ts` so both this block and the rhythm detail card share one source of truth, preventing drift).
- **Reset:** first day of new month rolls counts back to 0. Previous month's totals are not lost (they remain queryable on the rhythm detail card; only the strip resets).
- **Empty state:** when a dimension has fewer than 4 check-ins this month, it's omitted rather than shown as "0" — keeps the strip honest and never gamified.
- **Tap:** routes to `/insights/performance-rhythm` (since that detail card already breaks down the 4 dimensions).

#### Trajectory row suppression

Once 8a is live, the four-row stack becomes three rows (Rhythm, Drains, Restores). The Trajectory `InsightSummaryRow` is wrapped in `{false && (...)}` — component + route + detail page remain so the dial's tap target still works.

---

### Data scientist notes (why this is the right shape)

- **Inner Readiness is a daily-noise, weekly-pattern signal.** A speedometer + 7 dots reads it correctly: one glance at today's tier + immediate context of the trailing days. Resetting weekly prevents stale "30-day streak" anchoring that would fight the daily decision question.
- **Dimension performance is a slow signal** — a single bad day shouldn't flip "In-Control Regulation". A monthly cumulative count over a quartile threshold is statistically more stable and matches how a CEO already thinks in monthly cycles. Quartiles use the user's own baseline so the counts mean the same thing for everyone regardless of absolute slider behaviour.
- **Thumbs up/down with embedded count** preserves the affective punch of the flame icon the user liked, without the gamified "streak" semantics that don't fit an executive product.

---

### Files (delta vs prior plan)

Added/changed:
- `src/components/insights/InnerReadinessDial.tsx` (new)
- `src/components/insights/PerformanceStreaks.tsx` (new)
- `src/utils/dimensionTiers.ts` (new — quartile helper shared with `PerformanceRhythmCard.tsx`)
- `src/pages/Insights.tsx` — render the two new blocks above the row stack; suppress Trajectory row.
- `src/components/insights/InsightSummaryRow.tsx` — drop the right-side metric slot from the prior plan (item 7 reverted).

Removed from prior plan:
- The `metric` prop on `InsightSummaryRow` and all "today's value on the right" wiring.

Unchanged from prior plan: items 1–6 and the per-card share refactor.

No edge function, schema, RLS, scoring, or memory changes.
