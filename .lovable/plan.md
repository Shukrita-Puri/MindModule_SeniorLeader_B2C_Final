## 1. Inner Readiness Dial (top card)

`src/components/insights/InnerReadinessDial.tsx`

- **Copy:** Title → `Your Performance Trajectory`. Subheadline (grey, same `text-[11px] uppercase tracking-[0.12em]` style) → `Inner Readiness Streak · This Week`.
- **Number colour:** Force black (`hsl(var(--foreground))`) regardless of tier — keep the arc segment as the colour cue.
- **Score ranges (documented in code comment, also shown in the info tooltip):**
  - Red (Depleted): `< 40`
  - Amber (Recovering): `40 – 66`
  - Green (Strong): `≥ 67`
- **Past-day colouring (root cause of empty dots):** `inner_readiness_scores` is only written when an `outer-readiness` brief runs, so most historical days are blank. Fix by:
  1. In parallel with the existing `inner_readiness_scores` fetch, query `daily_checkins` for the same Mon→Sun window (`clarity_level, emotion_level, pressure_level, regulation_level, checkin_date, created_at`).
  2. Group check-ins by `checkin_date`; per day compute a composite using the same weighting already used by `energyStateScoring` (or a small helper here that mirrors it: avg of clarity/emotion/regulation + inverted pressure, scaled to 0–100). When a day has multiple check-ins, **average the per-check-in composites** to get the day's final score, then map through `tierFor` for the dot colour.
  3. Prefer the `inner_readiness_scores` row when present (canonical), otherwise fall back to the averaged check-in composite. Today's dot continues to use the live `outer.innerReadinessScore`.
- Keep dot future-state dimming and today's ring as today.

## 2. Performance Streaks card

`src/components/insights/PerformanceStreaks.tsx` + `src/utils/dimensionTiers.ts`

- **Copy:** Eyebrow stays `Your Performance Trajectory` *(if we keep one header line — confirm)*. Add a grey subhead line in the same style as the dial's: `Performance Streak · This Month`.
- **Wire to the same flame logic the dimension trends use.** Today the streaks use 90-day personal quartiles; the user wants parity with the flame on the *Performance Rhythm* trends (`LevelTrendCalendar`), which counts **consecutive days in the current calendar month where any slot value ≥ 4**. Replace `computeDimensionStreaks` with that rule:
  - **Peak (👍):** consecutive in-month days where any of morning/midday/evening for that dimension was **level 4 or 5** (i.e. Lucid+Crystal, Composed+Open, Light+Spacious, Strong+In-Control). **Neutral (3) is excluded** — matches the existing flame.
  - **Friction (👎):** consecutive in-month days where any slot for that dimension was **level 1 or 2** (Clouded/Obscured, Reactive/Unsettled, Elevated/Overloaded, Low/Reactive). For pressure the raw levels already encode "overloaded = low", so the same `≤ 2` rule applies after the existing inversion swap.
  - Streak resets on the 1st of the month and on any day in-month where the dimension had a check-in but did not meet the band.
- Query source: same `daily_checkins` rows the dial pulls; we can share the fetch via a tiny hook (`useWeekMonthCheckins`) to avoid duplicate round-trips.
- Counts in the chips become the streak length (matches the "5" flame in the screenshot), not a monthly tally.

## 3. Share button placement (UX recommendation)

Current placement (overlaid in the top-right of each card, just left of the `i` icon) still competes visually with the tooltip trigger and forces a small 36px hit target into a dense corner.

**Recommendation: move Share to the card footer, right-aligned, on its own row.**

- Pattern used by Apple Health / Notes / Strava detail screens: primary content owns the top, share is a low-emphasis action at the bottom-right.
- Avoids any collision with the info tooltip, and the capture target (the whole card) is unchanged so multi-tab share still works.
- Implementation: in `src/pages/InsightDetail.tsx`, drop the absolute-positioned `ShareCardButton` overlay and instead render a thin footer strip after `card.render(...)`:
  ```text
  ┌── card content (captured) ──┐
  │ …                           │
  └─────────────────────────────┘
     [ Share ↗ ]   ← right-aligned, 12px above bottom safe area
  ```
- Keep `captureRef` wrapping only the card body (not the footer) so the share PNG doesn't include the share button itself.

## 4. Out of scope / unchanged

- No backend / edge-function changes. All new math is client-side off existing tables (`daily_checkins`, `inner_readiness_scores`).
- `PerformanceRhythmCard` flame logic is the reference and remains untouched.
- No copy changes on other insight cards.

## Files touched
- `src/components/insights/InnerReadinessDial.tsx`
- `src/components/insights/PerformanceStreaks.tsx`
- `src/utils/dimensionTiers.ts` (replace quartile logic with flame-parity rule)
- `src/pages/InsightDetail.tsx` (relocate share button)
