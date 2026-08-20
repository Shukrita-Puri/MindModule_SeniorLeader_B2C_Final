# Performance Rhythm card — chart consistency + pattern section redesign

Scope: `/insights/performance-rhythm` only. UI/presentation changes; no scoring, edge-function, or data-pipeline changes.

---

## Part 1 — Chart consistency, 7-day window, scroll indicator

### 1A Chart shape
`LevelTrendCalendar.tsx` currently draws each slot as a `24x16` pill (`rounded-full`). The drain grid in `PerformanceCausalityCard.tsx` uses `h-9 rounded-md` cells that fill the column width.

Change the four trend charts to that same bar grammar: `rounded-md`, height matched to the drain cell, width filling the day column, same inter-cell gap. Colours, gradients, palettes, and tier logic stay exactly as they are.

### 1B 7-day Mon–Sun window
Today the scroller pins column width to `clientWidth / 7` on mobile only; desktop uses a fixed 26px column, so 10–12 days show at once.

- Compute column width as `container / 7` on all breakpoints, so exactly 7 days are visible everywhere (matches current iOS behaviour).
- Keep horizontal scroll for past weeks; keep the existing auto-scroll-to-current-Monday behaviour, recomputed against the new column width.
- Month-boundary weeks: when a week is clipped by the start or end of the month, the partial week renders as its own 7-column block starting on the 1st / ending on the last day, with the unused columns left empty rather than back-filling into the previous month.
- Day states (visual only): past day with no check-in → white filled bar in the new shape; today → white bar with the existing highlight ring; future → existing dashed outline.

### 1C Scroll indicator
Move the scroll affordance/scrollbar below the chart block (extra bottom padding on the scroll container plus a spacer row) so it is not overlapped by the bars.

---

## Part 2A — Audit of the pattern pipeline (delivered before any Part 2 UI change)

Read of the current system, from `performance-rhythm-insights` + `cause-effect-engine`:

- **Performance Patterns** (`mindRhythmPatterns.topThree`) — pure check-in data (`daily_checkins`, 4 mind dims) plus wearable rhythm series (HRV, sleep score/duration/efficiency) run through the shared check-in pattern aggregator. Deterministic day-of-week / time-of-day miner; sentences are template-generated server-side (`text` / `longText`), ranked by `priorityScore`. **No LLM, no prompt.**
- **Event Categories Where You Thrive** — `performanceLift.category_lift` from `causality_findings.signal_summary` (written by `cause-effect-engine`): peak HR inside event windows from `wearable_data.hr_samples` vs resting baseline, joined to same-day readiness, rolled to A–H categories. Rendered as bars. Deterministic.
- **Your Sharpest Window** — `bestReadinessWindow`: highest average composite readiness cell across day × window, labelled by string template.
- **Check-in dimension analysis** — the 4 chart tabs (`clarity/emotion/pressure/regulation` from `daily_checkins`); the chart itself carries no text.
- **Other blocks** — Sleep → Next-Day Peak and Recovery → Best Window (`sleep_to_peak`, `rhr_recovery_window`, `recovery_streak_to_peak`), Calendar Pattern (`calendarInsight`, deterministic string from calendar events × readiness), and `GATE_REASON_COPY` "Awaiting …" lines emitted from diagnostics.

I will post this audit in chat as the first step and wait for your confirmation before applying 2B–2E.

---

## Part 2B–2D — Content restructure (after your sign-off)

- **Remove redundancy:** de-duplicate findings that cite the same dimension and direction (e.g. "Thursdays sharpest on HRV" vs "Saturdays slip on HRV vs Thursdays") — keep the higher-priority/richer one. Cap at 3 lines.
- **Remove no-data lines:** drop the `GATE_REASON_COPY` "Awaiting …" block entirely; when a block has no data, render nothing (no label).
- **Collapse to text:** Event Categories and Your Sharpest Window become 1–2 inline sentences inside Performance Patterns; the category bar chart and the emerald Sharpest Window card are removed from this card.
- **Two sub-sections** inside Performance Patterns, separated by a label and a thin divider (no new cards):
  - *Check-in patterns* — clarity / emotion / pressure / regulation findings.
  - *Baseline patterns* — HRV, sleep, RHR, calendar/event findings, plus the collapsed category and sleep/recovery lines.

## Part 2E — Insight uniqueness across the 4 tabs

Risk confirmed: Performance Patterns renders once outside the tab switcher, so all four tabs show the identical three sentences.

Simplest fix (UI-only): in the *Check-in patterns* sub-section, filter findings to the active tab's dimension and fall back to the top-ranked findings only when that dimension has none. Baseline patterns stay shared across tabs, since they are not dimension-specific.

---

## Technical notes

Files touched: `src/components/insights/LevelTrendCalendar.tsx` (shape, 7-day window, scroll padding), `src/components/insights/PerformanceRhythmCard.tsx` (pattern section restructure, dedupe, tab-scoped findings, removal of gate-reason lines and the two visual blocks). No edge functions, no SQL, no scoring changes.

## Verification

- `tsgo` typecheck plus the existing insights test suite.
- Playwright screenshots of `/insights/performance-rhythm` on desktop and a mobile viewport, one per tab, confirming 7 visible days, matching bar shape, visible scroll indicator, and the restructured text section.
