# /executive-home — Swipeable Premium Redesign

A focused, minimal-risk UI redesign of `/executive-home`. Existing data sources, brief logic, plan logic and check-in flow are preserved. Only presentation and a new MRS visualization are added.

## Scope

In:
- New 3-page horizontal swipe shell for `/executive-home`.
- New Mental Readiness Score (MRS) page (page 1) with score, dial, trend delta, sparkline, and progression copy.
- Page 2 = existing Performance Brief (reusing `PerformanceReadinessBrief` / `DecisionReadinessBrief`).
- Page 3 = existing Daily Plan (reusing `TodayThreePriorities`).
- Page indicators (right) and "Take Assessment" pill (left).

Out (not touched):
- Brief generation logic, plan generation, check-in flow, auth, routing, sidebar, coach FAB.
- Other pages and the rest of the app.

## Page 1 — MRS Visualization

Data sources (already exist, no backend changes):
- Current score + tier: `useOuterReadiness()` → `innerReadinessScore` (0–100) and `innerReadinessTierDisplayed || innerReadinessTier`.
- Trend history: existing `mental-fitness-scores` edge function, `action: 'GET_SCORES'`, `days: 30`. Returns `mental_fitness_scores` rows with `score_date` + `score`.
- Comparison logic (client-side, in a new tiny `useMrsTrend` hook):
  - Primary delta = today's score vs 7-day mean of the prior 7 days.
  - Fallback delta = today vs most recent prior day if <7 days of history.
  - If 0–1 prior points: show "Building your trend history" and hide delta.

Visualization:
- Premium circular gauge (SVG, no new dependency) showing 0–100 with tier-coloured arc. Uses existing tier tokens.
- Centered score (e.g. `65`) with `/100` and label "Mental Readiness Score".
- Delta chip below (e.g. `+6 vs last week` or `–4 vs yesterday`), green/amber/red token by sign.
- Progression caption: "Upward trend this week" / "Stable over the past 7 days" / "Slight dip from your recent baseline" — derived from delta magnitude.
- Compact 7-day sparkline (SVG line + dots) under the gauge, current point highlighted. No range switcher in v1 (1W only) — leave a hook for 1M/6M later.
- Fallbacks: no current score → muted gauge + "Check in to generate your score" CTA. No history → sparkline placeholder strip + "Building your trend history".

## Page 2 — Performance Brief

- Renders existing `<PerformanceReadinessBrief />` unchanged inside the swipe page. No logic edits.

## Page 3 — Daily Plan

- Renders existing `<TodayThreePriorities />` unchanged inside the swipe page. No logic edits.

## Swipe Shell

- New component `HomeSwipeShell` using a horizontal scroll-snap container (`overflow-x-auto`, `snap-x snap-mandatory`, one `snap-center` page per child). Touch-native, no library needed — works on iOS and avoids gesture conflicts with vertical scroll inside each page.
- Page indicators: vertical pill column pinned right (`fixed right-2 top-1/2`), 3 dots, active dot widens. Updates on scroll via `IntersectionObserver` on the page panels.
- "Take Assessment" pill: pinned left (`fixed left-2 top-1/2`), shown when `useCheckInMode()` reports the current window's check-in is not yet done. Tapping routes to `/daily-check-in` (existing flow). Hidden otherwise — never blocks content.
- Each page is independently vertically scrollable; horizontal swipe only at top-level container. Container respects `env(safe-area-inset-*)`.

## ExecutiveHome integration

- `ExecutiveHome.tsx` keeps `SidebarProvider`, `LeftSidebar`, header, `TodayHero`, `TodayGreeting`, `TodayStepper`, tour, historical brief overlay, plan feedback modal.
- The single existing `<PerformanceReadinessBrief />` block is replaced with `<HomeSwipeShell>` containing the three page components.
- All other state (`historicalBriefId`, `planFeedback`, `showGuide`, `briefCtaReady`) is preserved.

## Technical details

New files:
- `src/components/home/swipe/HomeSwipeShell.tsx` — scroll-snap container, page indicators, observer.
- `src/components/home/swipe/AssessmentPill.tsx` — left-side CTA, hidden when not needed.
- `src/components/home/mrs/MrsPage.tsx` — page 1 composition.
- `src/components/home/mrs/MrsGauge.tsx` — SVG circular gauge.
- `src/components/home/mrs/MrsSparkline.tsx` — SVG 7-day sparkline.
- `src/hooks/useMrsTrend.ts` — fetches `mental-fitness-scores` GET_SCORES, computes delta + caption.

Modified files:
- `src/pages/ExecutiveHome.tsx` — swap single brief block for `<HomeSwipeShell>` with 3 children.

No backend, schema, RLS, edge function, or auth changes. No new npm dependencies (SVG only).

## Fallback matrix

| State | Page 1 | Page 2 | Page 3 |
|---|---|---|---|
| Loading | Gauge skeleton + sparkline shimmer | Existing skeleton | Existing skeleton |
| No current score | Muted gauge + "Check in to generate your score" | Existing fallback | Existing fallback |
| No history | Score + "Building your trend history" + placeholder strip | n/a | n/a |
| Error | Same as no score, retry on next focus | Existing | Existing |

## Acceptance / QA

- 3 horizontally swipeable pages on `/executive-home`, snap-aligned.
- Page indicators reflect active page; tappable.
- "Take Assessment" pill appears only when current-window check-in is pending and routes to `/daily-check-in`.
- MRS gauge shows the same number as the existing brief score.
- Delta uses `mental_fitness_scores` history; falls back gracefully under 2 points.
- Brief (page 2) and Plan (page 3) behave identically to today.
- No regressions to tour, historical brief overlay, plan feedback modal.
- TypeScript builds clean.
