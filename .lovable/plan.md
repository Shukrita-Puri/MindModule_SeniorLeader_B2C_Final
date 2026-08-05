# MRS v4 — Evening double-count + Tomorrow Demand correction

Audit-first pass across GitHub source and the live backend. No changes to the approved MRS v4 model: dual-pillar gate, zero/null semantics, intra-pillar redistribution, Pattern behaviour, 60% zero-demand credit and tier boundaries all stay exactly as they are. No new gate, blocker, veto or frontend override is introduced.

## What the audit already found (evidence)

Evening physiology (`_shared/signal-engine/mrs-v4-weights.ts`, `mrs-v4-subscores.ts`):
- Evening cells: `hrvMorningDeviation` 8.75, `sleepDeviation` 6.125, `rhrTrend` 2.625, `eveningPhysioRead` 32.5, `todayRealizedDemand` 18, `tomorrowOpeningDemand` 12, `patternEngineComposite` 20 = 100.
- `fromEveningPhysio()` reads `eveningHrvDeviationPct ?? hrvDeviationPct`, and `buildMrsV4SubScores` additionally falls back to `fromAbsoluteHrv(hrvValue)`.
- No caller passes `eveningHrvDeviationPct` or `bodyLoadElevated`. `build-executive-home-cards/index.ts:713-727` supplies only `hrvValue` / `hrvDeviationPct`. So today the Evening 32.5-point cell is *always* the same morning HRV deviation already scored at 8.75 — 41.25 of 50 physiological points driven by one measurement.
- Data check: `wearable_data` has no evening HRV column, but it does carry timestamped `hr_samples` (300+ samples/day on recent rows) plus `resting_heart_rate` — the same raw material `evening-context.ts` intends for its body-load read.

Tomorrow demand:
- `build-executive-home-cards/index.ts:724` passes `tomorrowOpeningDemand: demandScore` — today's value.
- Tomorrow's deduped events are *already* loaded by the existing `loadDayTypeEventSlices()` (`tomorrowEvents`), and the existing demand engine is `computeCalendarDemand()` from `_shared/signal-engine/demand-scorer.ts` (already used by `yesterdayDemand()`). No new demand algorithm is needed.
- `compute-inner-readiness/index.ts:928-960` back-fills any *unavailable* demand sub-component — including `tomorrowOpeningDemand` — with today's `demandScore`, which would mask the fix.

## Changes to make

### 1. Evening: keep `eveningPhysioRead` as the independent read (Option B-shaped)
- Remove the morning-HRV substitution in `fromEveningPhysio()` and the `fromAbsoluteHrv(hrvValue)` evening fallback. `eveningPhysioRead` is earned only from genuinely evening-window signals: an evening HRV deviation when one exists, and/or the evening body-load read.
- Supply the independent signal in `build-executive-home-cards`: derive evening body-load from today's `hr_samples` (mean bpm in the evening window) versus the existing 30-day RHR baseline, using the same deviation approach the afternoon `intradayHrDeviation` path uses. Pass it as `bodyLoadElevated` / evening deviation.
- Keep `hrvMorningDeviation` as an Evening cell at 8.75 (morning HRV is legitimate evening context, counted once).
- When no independent evening signal exists, `eveningPhysioRead` is simply `available: false` and its 32.5 points redistribute intra-pillar to the earned physiological cells — existing §8.3 behaviour, no new gate, MRS still forms.
- Evening weight table is untouched and still sums to 100.

### 2. Tomorrow: real tomorrow demand from the existing source
- Reuse `loadDayTypeEventSlices().tomorrowEvents` (already deduped by `mergeCalendarEvents`) and run it through the existing `computeCalendarDemand()`.
- Calendar semantics preserved: not connected → `null`; connected with zero tomorrow events → `0` (earned, 60% credit); events → calculated number.
- Local-day boundaries reuse the existing `localDate`-based slice logic already used for today/yesterday/tomorrow, so no new UTC/local interpretation.
- Restrict the `compute-inner-readiness` demand back-fill so `tomorrowOpeningDemand` is never silently filled with today's demand.
- The 12-point evening Demand allocation is unchanged.

### 3. Tests
- Composer/subscore tests: independent evening HRV present; evening HRV absent but body-load present; both absent (cell unavailable, redistribution handles it, MRS still forms); explicit assertion that a morning HRV deviation cannot appear in two score-bearing cells.
- Tomorrow tests with X ≠ Y: tomorrow with events, tomorrow zero-events-connected, calendar unavailable, and today-demand ≠ tomorrow-demand asserting the two cells differ.
- Re-assert unchanged invariants: dual-pillar gate, `ZERO_DEMAND_CREDIT = 0.6`, morning 20/10 split, weight sums = 100.

### 4. Morning yesterday-carryover regression check (verification only, no code change)
- Prove at runtime, not by weight definition, that Morning Demand receives a *real* yesterday value:
  - Construct a scenario where yesterday demand X ≠ today demand Y and assert `yesterdayCarryover.rawDemand === X` while the today cell carries Y.
  - Assert `yesterdayCarryover` is `pillar: 'demand'` with a 10-point allocation, and Morning Demand totals 30 (20 today + 10 yesterday).
  - Trace the value back through `yesterdayDemand()` → `computeCalendarDemand()` on yesterday's own calendar events.
- Verify zero/null semantics for yesterday: connected + zero events → `0` earned (60% credit); calendar unavailable → `null` unearned; events present → calculated number.
- Evidence in the report: the relevant source lines plus live `weight_provenance` JSON showing the distinct yesterday value.
- No change to the 20/10 weighting and no new gate.

## Verification and report
- Run the Deno MRS composer tests, Deno checks on the touched functions, full Vitest suite and `tsgo`.
- Redeploy `compute-inner-readiness` and `build-executive-home-cards`; re-run scenarios A–I against the live backend using real rows, reporting actual provenance JSON (`weight_provenance`) as evidence.
- Report: files changed, diffs, commit SHA, per-scenario evidence, and an explicit answer to the four final check questions. Deployed-bundle SHAs are not exposed by the platform — that limitation will be stated rather than claimed as cryptographic proof.
- The report will state explicitly: "Yesterday's realised demand is still actively contributing to Morning Demand; it has not merely remained as a weight definition." — backed by source and runtime/provenance evidence.

## Out of scope
Yesterday-carryover comment/grouping in `mrs-v4-weights.ts` stays as is (functionally correct: `pillar: 'demand'`, 10 pts, fed from yesterday's own events). No tier, anchor or eligibility changes. `remainingDayDemand` / `realizedSoFarCost` afternoon aliasing is noted but left untouched unless you want it in scope.