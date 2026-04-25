## Goal

Bring the three new trend calendars (Clarity / Sharpness / Confidence) to full parity with **Mental Energy Trend** — full month of scrollable history, correct color mapping for the actual 1–5 data range, palette aligned to the daily check-in outcome accents, per-trend legends, and the requested renames.

## Findings (verified against code + DB)

1. **Data range bug** — DB stores `clarity_level` / `mental_sharpness_level` / `confidence_level` as **1–5** (confirmed: `MIN=1, MAX=5` across 169 rows). `LevelTrendCalendar`'s tier table assumes **1–10**, so a check-in of `4` ("Lucid"/"Acute"/"Certain") wrongly renders as **amber "Low"**. This is the root cause of the visual mismatch.
2. **Layout collapsed to one week** — `LevelTrendCalendar` only fetches `Mon→Sun` of the *current* week. Mental Energy Trend uses `weekRows` covering the trailing month and is horizontally scrollable. The three new trends therefore look "compressed" and don't match.
3. **No legend** under the three new trends.
4. **Palette drift** — Daily Check-in outcomes use:
   `#d8553f` Overloaded · `#e88a52` Drained · `#d4b75a` Scattered · `#7ba87a` Steady · `#3d6fa8` Focused.
   Mental Energy Trend currently uses Tailwind `red-900 / amber-800 / slate-700 / blue-900 / emerald-800` — close but not the same accents.
5. **Renames requested**:
   - Card title `"Your Readiness Rhythm"` → **"Mind Readiness Rhythm"**
   - `"Mental Energy Trend"` → **"Energy Trend"**
   - `"Mental Sharpness Trend"` → **"Sharpness Trend"**
   - `"Clarity Trend"` and `"Confidence Trend"` unchanged.

## Implementation

### 1. `src/components/insights/LevelTrendCalendar.tsx` — full rewrite of layout + tiers

- **Fetch trailing ~30 days** (instead of current Mon→Sun). Compute the Monday of the week containing `today − 30d` as the start, end at the Sunday of the current week. Build a single ordered array of `DayCell`s for that range.
- **Group into `weekRows`** the same way `PerformanceRhythmCard.weekRows` is built, then render a single horizontally scrollable strip of all days (matching Energy Trend's `inline-flex` + per-day column layout).
- **Auto-scroll on mount** to the current week (mirror the `mondayIdx * colWidth` logic used in PerformanceRhythmCard, including mobile equal-width column behavior).
- **Fix the 1–5 tier mapping** to match the slider semantics shown on the detailed Check-in page:

  | Value | Slider label (sharpness/clarity/confidence) | Tier label | Palette token |
  |-------|---------------------------------------------|------------|---------------|
  | 5 | Peak / Crystal / Unshakable | **Peak** | `#3d6fa8` (Focused-blue) |
  | 4 | Acute / Lucid / Certain | **Strong** | `#7ba87a` (Steady-green) |
  | 3 | Stable / Neutral / Poised | **Steady** | `#d4b75a` (Scattered-gold) |
  | 2 | Dull / Obscured / Uncertain | **Low** | `#e88a52` (Drained-amber) |
  | 1 | Depleted / Clouded / Reactive | **Depleted** | `#d8553f` (Overloaded-coral) |

  Note: this **inverts the visual mapping correctly** — the higher the value, the "cooler / more confident" the color, in line with the daily check-in outcomes (Focused = blue is the best state).
- Replace Tailwind `from-* to-*` gradient classes with inline `background: linear-gradient(135deg, color, darken(color))` so we can use the exact hex values from the check-in palette. Glow stays as a subtle `boxShadow` derived from the same color.
- **Add the same scroll hint** (`← scroll for past weeks`) above the strip.
- **Add a legend below each calendar** with the 5 swatches + labels (Depleted · Low · Steady · Strong · Peak), styled identically to Energy Trend's legend (`flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-3 border-t border-border/20`).
- Title row keeps the existing `InsightInfoModal` tooltip; tooltip copy updated to reflect the 1–5 scale (not 1–10).

### 2. `src/components/insights/PerformanceRhythmCard.tsx` — palette + renames

- **Update `stateColors` gradients** to use the daily check-in accents so Mental Energy Trend matches the Daily Check-in screen exactly:
  - `overwhelmed` → `#d8553f`
  - `drained` → `#e88a52`
  - `scattered` → `#d4b75a`
  - `steady` → `#7ba87a`
  - `focused` → `#3d6fa8`
  Switch the dot fill from `bg-gradient-to-br from-X to-Y` (Tailwind) to inline `linear-gradient(135deg, color, darken(color, ~12%))` and keep the glow consistent. The legend at the bottom of Mental Energy Trend already iterates `stateColors`, so it updates automatically.
- Change card title `"Your Readiness Rhythm"` → **"Mind Readiness Rhythm"**.
- Rename `"Mental Energy Trend"` heading + InsightInfoModal title → **"Energy Trend"**.
- Rename `"Mental Sharpness Trend"` (passed to `LevelTrendCalendar`) → **"Sharpness Trend"**.
- Leave `"Clarity Trend"` and `"Confidence Trend"` unchanged.

### 3. No backend / DB changes
All three level fields already exist on `daily_checkins` with a 1–5 range; the calendar will just query a wider date window. No migrations, no edge-function edits.

### 4. QA / verification
- Visually confirm at mobile (719px viewport, current preview) that all four calendars share identical column widths, scroll behavior, day headers, and legend styling.
- Confirm a recent check-in with `clarity_level = 4` now renders as the **Strong** (sage-green) tier, not amber.
- Confirm horizontal scroll exposes the prior 3–4 weeks for each of the three new calendars (auto-scrolled to current week).
- Confirm Daily Check-in outcome buttons and Mental Energy Trend dots show visually identical colors when placed side by side.

### Files touched
- `src/components/insights/LevelTrendCalendar.tsx` — rewrite (tiers, multi-week fetch, scroll, legend, palette).
- `src/components/insights/PerformanceRhythmCard.tsx` — `stateColors` palette, dot rendering switched to inline gradient, three renames.

### Memory updates (after implementation)
- Save `mem://features/insights/level-trend-calendars` capturing: 1–5 tier ↔ check-in-palette mapping, trailing-month scroll layout, per-trend legend, and the canonical palette hex values.
- Update `mem://index.md` Memories list with the new entry.

Ready to implement on approval.