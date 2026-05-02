## Mind Readiness Trend — UI refresh (no logic/scoring changes)

Pure presentation update to the section currently titled **Mind Readiness Rhythm** in `src/components/insights/PerformanceRhythmCard.tsx`. No edge functions, no schema, no scoring math touched. Streak is a derived count from the same `daily_checkins` rows already fetched by the four calendars.

---

### 1. Rename
- Section title: `Mind Readiness Rhythm` → **`Mind Readiness Trend`** (header + `InsightInfoModal` title).
- Memory file `mem/features/insights/level-trend-calendars.md` updated to reflect the new title.

### 2. Tab switcher (one chart at a time)
Match the existing **Cause & Effect** card pattern: a row of 4 pill buttons directly under the section header.

```text
[ Energy ] [ Clarity ] [ Sharpness ] [ Confidence ]
```

- Default: `Energy` selected on mount.
- Active pill uses the same active style as the cause-effect tabs (filled bg, foreground text).
- Only the selected dimension's calendar renders below — the existing collapsible "Show Clarity, Sharpness & Confidence" toggle is removed.
- Mobile: pills wrap; horizontal scroll if needed.

### 3. Per-chart header layout
Replace the current `[title] ............ [← scroll for past weeks]` row with a 3-zone layout:

```text
[ Title (info-icon) ]   ← scroll for past weeks      [ Wreath ]
        left                    middle                  right
```

- Title + info icon: left.
- "← scroll for past weeks" hint: now sits next to the title (middle of the row, smaller muted), as requested.
- Wreath: extreme right, vertically centered against the calendar block (slightly overhanging above the dot grid is fine).

### 4. Streak Wreath component
New file: `src/components/insights/StreakWreath.tsx`.

- Reuses the **exact SVG paths** from `src/components/MetaSkillsWreath.tsx` (laurel branches + bow), so we are not redrawing it.
- Differences from `MetaSkillsWreath`:
  - Transparent background (no card / no shadow wrapper, no tooltip provider).
  - Color: solid **gold** (`hsl(var(--gold))`) — drop the existing gradient stop variation, keep one clean gold fill.
  - No drop-shadow filter on the SVG.
  - Removes the inner "Meta Skills"/"Growth" label.
  - Center text: large gold streak number (e.g. `7`).
  - Caption below the wreath (outside the SVG, centered): `days of high energy` / `days of crystal clarity` / `days of peak sharpness` / `days of strong confidence` — tiny uppercase, 9–10px, gold/muted.
  - Empty state (streak `= 0`): wreath rendered at 35% opacity with a faint `—` in the center; caption reads `start your streak`.
  - Milestone celebration at `3 / 7 / 14 / 21 / 30`: subtle one-shot gold pulse (CSS keyframe scale 1 → 1.06 → 1, 1.2s) plus a tiny gold sparkle dot above the bow. No confetti, no toasts — keeps with the executive aesthetic.

Props:
```ts
interface StreakWreathProps {
  count: number;            // current streak
  label: string;            // e.g. "days of high energy"
  milestone?: 3|7|14|21|30; // when the count crosses one, parent passes it for the pulse
}
```

Sized ~64×56 px so it sits cleanly to the right of the dot grid header.

### 5. Streak calculation (UI-only derivation)
Run on whatever rows the chart already has — no new queries.

Common rules:
- **Window:** current calendar month only (1st of month → today). Streak resets to 0 on the 1st of every month.
- **Day grain:** one entry per local date. If multiple check-ins exist that day, the day counts as "positive" if **any** check-in that day meets the positive band.
- **Anchor:** streak is the number of consecutive positive days ending **today** (or, if today has no check-in yet, ending yesterday — so the streak doesn't visually break mid-day).
- **Gap rule:** any in-month day with a check-in that is **not** positive ends the streak. A day with **no check-in** also ends the streak (best-in-class: "streak = consecutive days you showed up positively"); this matches how Apple/Strava handle daily streaks and avoids inflating numbers across silent days.

Positive bands (already defined in the level-trend memory, no new logic):

| Dimension | Source | Positive when |
|---|---|---|
| Energy | `daily_checkins.outcome` | `outcome ∈ { focused, steady }` |
| Clarity | `daily_checkins.clarity_level` | `>= 4` |
| Sharpness | `daily_checkins.mental_sharpness_level` | `>= 4` |
| Confidence | `daily_checkins.confidence_level` | `>= 4` |

Compute location:
- **Energy** streak: in `PerformanceRhythmCard.tsx` from the `checkIns` array already in scope.
- **Clarity / Sharpness / Confidence** streaks: inside `LevelTrendCalendar.tsx`, derived from the `days[]` it already builds for the month. Add an optional `onStreak?: (count: number) => void` callback so the parent can show milestone pulses, OR (simpler and self-contained) render the `StreakWreath` directly inside `LevelTrendCalendar`'s header.

We will go with the **self-contained** approach: `LevelTrendCalendar` renders its own wreath in its header. The parent renders the wreath only for the Energy chart (which lives directly in `PerformanceRhythmCard.tsx`).

Milestone detection: keep `lastSeenStreak` in `useRef`; when the new value crosses one of `[3, 7, 14, 21, 30]` upward, pass that value as the `milestone` prop for one render so the wreath plays the pulse animation.

### 6. What is removed / kept
- **Removed:** the `Collapsible` "Show Clarity, Sharpness & Confidence trends" block (replaced by tabs).
- **Kept untouched:** all data fetching, `level-trend-calendar` edge function, palettes, vocabularies, "Your Rhythm Signals" block below, Calendar/Cause-Effect cards, scoring, RLS — none of these change.

### 7. Files touched

```text
src/components/insights/PerformanceRhythmCard.tsx   (rename, tab switcher, single-chart render, energy wreath, header layout)
src/components/insights/LevelTrendCalendar.tsx      (header layout, embed streak wreath, milestone tracking)
src/components/insights/StreakWreath.tsx            (NEW – reuses MetaSkills wreath SVG, gold, transparent)
mem/features/insights/level-trend-calendars.md      (rename + tab switcher + streak rules)
```

No DB migrations. No edge function changes. No new dependencies.
