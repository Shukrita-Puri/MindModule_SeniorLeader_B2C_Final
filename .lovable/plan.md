# Insights cards — share, badges, copy + pattern logic recap

## 1. Suppress flame "PEAK CLARITY" badge on the four trend tabs

In `When You Perform Best` (`PerformanceRhythmCard`), each tab renders a `LevelTrendCalendar` (Clarity / Emotion / Pressure / Regulation) and that component shows the engraved flame `StreakWreath` in the header (top-right, e.g. "5 PEAK CLARITY" in the screenshot).

- Add an opt-out prop `hideStreak?: boolean` to `LevelTrendCalendar` and skip the `<StreakWreath … />` block when true.
- Pass `hideStreak` from all four `LevelTrendCalendar` usages inside `PerformanceRhythmCard`.
- No data change; the streak just no longer renders on these four tabs.

## 2. Shared image title = `Mind Module — [Card Name]`

Confirm the shared image / native share-sheet title reads exactly:
- "Mind Module — Your Performance Trajectory"
- "Mind Module — When You Perform Best"
- "Mind Module — What Drains Your Performance"
- "Mind Module — What Restores Your Performance"

Today `InsightDetail` passes `title={`Mind Module — ${card.title}`}` and `shareInsightCard` forwards it verbatim — no double-prefix bug found, so no change needed beyond verifying the file name (`mind-module-{cardId}.png`) and the native dialog title both surface this string. Will spot-check in the share util to be certain nothing strips/replaces it.

## 3. Full scrollable card in the shared image (not just the visible viewport)

Today `shareInsightCard` snapshots the on-screen DOM node, so the export clips to the visible area. Rhythm calendar's months and any tall card lose content.

Fix in `src/utils/shareInsightCard.ts`:

- Before `toPng`, walk the captured node + descendants; save original `overflow`, `maxHeight`, `height`, `width`, and any horizontal-scroll container's `scrollLeft`.
- Set overflow to `visible`, drop fixed heights/maxHeights so intrinsic content lays out fully.
- Call `toPng` with `width: node.scrollWidth`, `height: node.scrollHeight`.
- Restore everything in `finally` (alongside the existing `[data-share-hide]` restore).

Result: sharing the Rhythm card exports the entire month-wide calendar; every other card exports its full content even if a section was scrolled out of view.

## 4. Rename "Mind Rhythm Patterns" → "Performance Patterns" (+ refreshed direction)

In `PerformanceRhythmCard.tsx` (~lines 1107–1111):

- Section heading and `InsightInfoModal` title both change to **Performance Patterns**.
- Update the modal explanation to reflect the new analysis direction:
  > "The strongest day-of-week × time-of-day patterns across your check-ins — when you peak, when you slip, and the repeating rhythm behind it."

### Analysis direction for "Performance Patterns" (this card only)
Server-side ranker (in `compute-daily-intelligence` → `mindRhythmPatterns.topThree`, sourced from `causality_findings.signal_summary`) must prioritise findings that surface:

1. **Strongest day-of-week** — which weekday consistently runs highest / lowest on the active dimension (e.g. "Mondays run sharpest on Energy — 88% vs 29% on Thursdays").
2. **Strongest time-of-day** — which slot (Morning / Midday / Evening) the user peaks or slips in (e.g. "Mornings carry your clarity; evenings repeatedly drop a tier").
3. **Day × time intersection** — the single recurring cell that explains the most variance (e.g. "Thursday evenings have slipped 4 of the last 5 weeks").

Ranker rules (unchanged from prior governance, reasserted here):
- Minimum 7 check-ins before any pattern renders.
- Personal noise excluded; only repetitions with statistical weight surface.
- Phrasing must pass `mem://features/performance-readiness/phrase-validation-standard` (no wellness tropes, executive tone).
- Top-three only; the rest go to the weekly email.

This will be enforced by tightening the prompt/scorer for `mindRhythmPatterns` in the edge function — to be wired in the implementation step.

## 5. Files touched

- `src/components/insights/LevelTrendCalendar.tsx` — add `hideStreak` prop.
- `src/components/insights/PerformanceRhythmCard.tsx` — pass `hideStreak` on 4 tabs; rename heading + modal copy.
- `src/utils/shareInsightCard.ts` — expand node to full scroll size during capture.
- `supabase/functions/compute-daily-intelligence/*` — re-prioritise `mindRhythmPatterns` ranker around day-of-week × time-of-day (details in §4).

No DB schema changes, no behavioural changes to other cards.

---

## Reminder — current "pattern" direction for every Insights card

### Your Performance Trajectory (Leadership Patterns)
- Source: `state-patterns-insights` over `brief_snapshots` (the side-panel past-briefs store) + check-in deltas.
- Direction: PRS shifts — momentum, regressions, plateaux — over 30/60/90 days; references show-up streaks.

### When You Perform Best — "Performance Patterns" (this update)
- Source: `compute-daily-intelligence.mindRhythmPatterns.topThree` ← `causality_findings.signal_summary`.
- Direction: strongest **day-of-week × time-of-day** repetitions per active dimension (see §4 above).

### What Drains Your Performance (Causality)
- Source: `event-load-correlation` → `causality_findings` (stress/burnout tags). 30-day wearable × calendar crossover.
- Direction: per-event-window peak-HR delta vs resting baseline, weekly-load patterns; only renders when both wearable and calendar coverage exist.

### What Restores Your Performance (Practice Effectiveness)
- Source: post-practice ratings × next-session check-ins (`practice_effectiveness`).
- Direction: rank practices by lift on the dimension the user is currently struggling with; suppressed until enough sessions are logged.

All four share the same governance: patterns are summarised server-side, never client-derived; min-data thresholds prevent thin-evidence claims; phrasing must pass the executive phrase-validation standard.
