## Goal

On the Insights page, the Mind Readiness Rhythm trend calendar currently exposes four tabs: **Energy / Clarity / Sharpness / Confidence**. Update it to reflect the consolidated mind check-in:

**Energy / Clarity / Emotion / Pressure / Regulation**

All four mind sliders read from the existing `daily_checkins` columns already populated by `/daily-check-in` (`clarity_level`, `emotion_level`, `pressure_level`, `regulation_level`). Sharpness is dropped (column kept in DB per beta policy, just no longer surfaced).

## Scope (UI + edge function only — no DB migration)

1. **`src/components/insights/PerformanceRhythmCard.tsx`**
   - Tab list: replace `sharpness`/`confidence` entries with `emotion`, `pressure`, `regulation`. `activeTrend` union updated to `'energy' | 'clarity' | 'emotion' | 'pressure' | 'regulation'`.
   - Render three new `<LevelTrendCalendar>` blocks (Emotion / Pressure / Regulation) and remove the Sharpness + Confidence blocks. Clarity block stays.
   - Vocabulary mirrors `/daily-check-in` slider labels exactly:
     - Clarity: Crystal / Lucid / Neutral / Obscured / Clouded (already correct)
     - Emotion: Open / Composed / Balanced / Unsettled / Reactive
     - Pressure: Spacious / Light / Manageable / Elevated / Overloaded
     - Regulation: In Control / Strong / Holding / Low / Reactive
   - `streakLabel` set per dimension ("Open Days", "Spacious Days", "In-Control Days").

2. **`src/components/insights/LevelTrendCalendar.tsx`**
   - Extend `LevelField` union to include `emotion_level | pressure_level | regulation_level`.
   - Extend `LevelPalette` union with `emotion | pressure | regulation` and add three new single-hue ramps in `PALETTE_RAMPS` that mirror the slider gradients on `/daily-check-in`:
     - **emotion**: light blush → deep burgundy (matches `emotion` slider variant)
     - **pressure**: light amber → deep amber (reuses sharpness gradient feel — heat/tension)
     - **regulation**: lavender → deep indigo (mirrors confidence/Energy dark-blue)
   - No other behavior changes; existing dot/legend/streak logic is dimension-agnostic.

3. **`supabase/functions/level-trend-calendar/index.ts`**
   - Extend `ALLOWED_FIELDS` to also accept `emotion_level`, `pressure_level`, `regulation_level`. Keep `mental_sharpness_level`/`confidence_level` for back-compat (no longer requested by the UI but harmless).

## Out of scope

- No DB migration. The four columns already exist on `daily_checkins`.
- No change to scoring, brief logic, or the daily check-in page itself.
- No change to other Insights cards.

## Verification

- Tabs render Energy / Clarity / Emotion / Pressure / Regulation in that order.
- Each new tab populates dots from the corresponding `*_level` column for the current month, slot-aware (Morning/Midday/Evening), with the matching slider gradient and 1–5 vocabulary.
- Streak counts continue to fire confetti at 3 / 7 / 14 / 21 / 30 day milestones.
