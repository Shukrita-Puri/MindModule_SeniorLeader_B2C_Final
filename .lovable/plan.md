# Day Type × HRV Impact (Burnout Risk tab only)

Additive change. The existing week-on-week burnout grid is untouched and becomes Pt B, below the new chart. No other tab, card, or edge-function logic changes.

## What the user sees

Burnout Risk tab, in two sub-cards:

- **A. Day Type × HRV Impact** (new, top) — heatmap where each row is a dominant day type (Travel, Governance, Visibility, Pitching, High-Stakes, Conference, Deep Work, Learning, Rhythm, Mixed) and each column is Mon–Sun. Cell shows next-day HRV change versus the user's own HRV baseline, signed in ms. Rows sorted with the highest cost (most negative mean) first. One pre-baked sentence under the grid, e.g. "Governance days suppress your next-day HRV the most (−18ms on average)." When there are fewer than 5 HRV days in the window, the section shows an honest "not enough HRV data yet" line instead of a grid.
- **B. Weekly HRV trend** (existing, unchanged) — the current burnout grid, banner and footnote, moved into its own sub-card below.

## Engine work (cause-effect-engine)

Bump `ENGINE_VERSION` 12 → 13 (forces one silent recompute). No existing calculation, gate, or output field is modified.

1. `classifyDominantDayType(events, loadMinutes)` — new pure helper, priority-ordered exactly as specified (Travel hard override → Governance → Visibility → Pitching (B vs C decided by total scheduled minutes) → High-Stakes → Conference (Visibility wins if C also gates) → Deep Work → Learning → Rhythm → Mixed fallback). Category/subtype come only from the canonical A–H resolver already used for Stress Load (`resolveEvent`), never from ad-hoc keyword matching.
2. Day Type × HRV matrix, computed after the existing `stressMatrix` block:
   - `hrvBaseline` = mean of `wearable_data.hrv` over the window, requires ≥5 days else the whole matrix is `null`.
   - For each calendar day with events: classify day type, look up next-day HRV, `hrvDelta = nextDayHrv − hrvBaseline`.
   - Accumulate `acc[dayType][dayOfWeek]` using the same Monday-start `dayIndex` logic as `stressMatrix`.
   - Cell = rounded mean, `n` = count, confidence `n≥5` strong / `n≥3` emerging / else null. Thin cells are kept with `hasData: true, confidence: null` — never dropped.
   - `maxAbsDelta` for client ramp scaling, `bannerCopy` pre-baked, `streakSummary` (current consecutive-day streak, its dominant type, mean next-day HRV delta).
3. New payload field `dayTypeHrvMatrix: DayTypeHrvMatrix | null` on the `Payload` interface. Secondary day category recorded in diagnostics only.

## Frontend work (PerformanceCausalityCard.tsx)

- Add the `DayTypeHrvMatrix` type to the local payload interface (optional, so older cached payloads keep rendering).
- New `DayTypeHrvTab` sub-section reusing `DrainHeatmapGrid` with rows = day types, columns = Mon–Sun, sticky row-label column and tooltips in the same style as Stress Load (day + n on line one, delta on line two). Ramp is diverging: negative delta (HRV suppressed) reads as high cost, positive as recovery; ramp labels "Recovery" / "Cost".
- `BurnoutRiskTab` wraps the new section and the existing grid in two `card-standard` sub-boxes with `A.` / `B.` labels, matching the existing card hierarchy. Existing grid markup, banner and footnote copy stay byte-identical.
- Mock payload (`causalityMockData.ts`) gains a `dayTypeHrvMatrix` sample so the preview path renders.

## Verification

- `deno check` on the edge function plus existing engine tests.
- Frontend typecheck and the existing insights tests.
- Local run of the engine against production data for shukrita@mindmodule.me to confirm v13 output: day-type distribution, baseline, cell counts and banner sentence, plus a check that `stressMatrix`, `burnoutMatrix` and `signal_summary` are byte-identical to v12 for the same inputs.
- Deploy `cause-effect-engine`.
