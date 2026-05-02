## Replace Streak Wreath with Engraved Flame Icon

Pure visual swap inside `src/components/insights/StreakWreath.tsx`. No logic, props, layout, or call-site changes — `PerformanceRhythmCard` and `LevelTrendCalendar` keep importing `StreakWreath` with the same `count` / `label` / `milestone` props.

### What changes

Replace the gold laurel-wreath SVG with a hand-drawn **engraved flame** in the same 19th-century scientific-engraving language we use in Reset Studio (per `mem://brand/reset-studio-visual-system`).

```text
   ╱╲
  ╱  ╲      ← outer flame: warm amber/orange, hatched stroke
 │ N  │     ← inner flame: gold core with the streak number
  ╲__╱
```

- **Style**: thin (1–1.25px) strokes in `hsl(var(--gold))` for the outer silhouette, plus 4–5 short hatch lines inside for the engraving texture (matches the pencil-engraving aesthetic of the wreath we're removing).
- **Color**: a coloured flame, not monochrome. Outer body = warm gold/amber gradient (`#e8a23a → #c9651f`), inner core = pale cream (`hsl(var(--gold) / 0.25)`) so the dark numeral reads cleanly. A single saffron tip wisp at the top.
- **Number inside**: the streak count is centered in the inner core, headline font, gold-foreground (`hsl(var(--gold))` on dark theme / dark ink on light). Auto-shrinks at 2 digits (28px) and 3 digits (22px) just like today.
- **Caption**: same caption (`days of high energy` / etc.) below the icon, same uppercase 9px gold treatment — unchanged.
- **Empty state** (`count = 0`): flame rendered at 35% opacity with a faint `—` in the core; caption stays `start your streak`.
- **Milestone pulse** (3/7/14/21/30): keep the existing `animate-streak-pulse` keyframe in `src/index.css`; add a tiny ember sparkle (one `<circle>` with `animate-ping`) above the flame tip during the 1.3s window.

### What stays identical
- File path: `src/components/insights/StreakWreath.tsx` (no rename — fewer ripples).
- Component name + export + props (`count`, `label`, `milestone`, `className`).
- Bounding box ~64×56 so the parent header layout doesn't shift.
- `mem/features/insights/level-trend-calendars.md` — update the two paragraphs that describe the icon as a "gold laurel wreath" so memory matches reality, but keep the streak rules section untouched.

### Files touched
```text
src/components/insights/StreakWreath.tsx           (rewrite SVG only — wreath → engraved flame)
mem/features/insights/level-trend-calendars.md     (rename "wreath" → "engraved flame icon")
```

No new files, no new dependencies, no edge functions, no DB.
