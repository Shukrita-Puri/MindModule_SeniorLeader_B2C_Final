# W3.5 — Complete the deferred architectural gap

## Honest status correction

W3 landed the validators and the persistence-time guard, but the pill tiers are still computed **after** the LLM writes the Brief (at L5849 in `compute-outer-readiness/index.ts`), while the LLM prompt is built around L4015. That means:

- The LLM never sees the final pill tiers.
- The deterministic fallback receives a hand-rolled `SpecDeterministicParams`, not the same pill context.
- "Response pills == persisted pills" holds only because the same `signalPillsPayload` object is reused for both — but neither equals what the LLM was told, and coherence auto-correction still mutates tiers **after** copy is written.

W3.5 fixes those four gaps without changing any tier thresholds.

## Files to add

### `supabase/functions/_shared/signal-pills/derive-pills.ts` (new, pure module)
- `type PillTier = 'green' | 'amber' | 'red' | 'neutral'`
- `type PillKey = 'decision_readiness' | 'physical_reserves' | 'resilience_capacity'`
- `interface PillDerivationInput` — every input the L5849–6350 block currently reads:
  - Wearable: `hrvValue, hrvDeviation, rhrValue, rhrDeviation, hrValue, hrDeviation, sleepDuration, sleepScoreVal, sleepEfficiency, rhr3dTrend, hrv3dTrend, wearableTrend7d`
  - Check-in: `clarityLevel, emotionLevel, regulationLevel, pressureLevel`
  - Calendar: `calendarLoad, calendarPressure, fragmentationScore, highStakesEventsCount`
  - Pattern: `sustainedDeficitFlag, consecutiveHighLoadDays, cooccurrence7d, typicalLoadForDow`
  - Freshness/gates: `wearableFreshForGate, checkInFreshForGate, hasWearable, wearableDaysConnected`
  - Baseline: `hrvBaseline, rhrBaseline, sleepBaseline`
  - Framing: `protectionGoals`
  - History rows for qualifiers: `checkinHistory14d, wearableHistory14d`
  - MRS tier for coherence: `mrsTier`
- `interface PillDerivationResult` — the complete canonical object:
  - `pills: SignalPill[]` (tier, tierLabel, coldStartLabel, contributors, sourceTypes, isScoreBearing, freshness, hiddenReason, detail, contributedByCheckIn, qualifiers)
  - `coherence: { inSync, adjustments, warning }`
  - `divergence: { pillar: PillKey; objectiveTier: PillTier; selfReportTier: PillTier; direction: 'objective_better' | 'objective_worse' }[]`
  - `derivedAtMs`
- `derivePills(input): PillDerivationResult` — verbatim move of L5879–6355 with:
  - No behavioural changes to thresholds, veto caps, freshness gates, physical-reserves displayable gate, or coherence assertion.
  - **Coherence auto-correction applied before return**, so callers see final tiers only.
  - Divergence detection: computed by comparing objective sub-tiers (HRV/sleep bands for Decision Readiness; RHR/HR bands for Physical Reserves; sleep-efficiency + pattern for Resilience) against check-in sub-tiers (clarity / emotion+regulation+pressure). Emitted whenever the two disagree by ≥1 tier step.

### `supabase/functions/_shared/signal-pills/assessment-context.ts` (new)
```ts
export interface AssessmentContext {
  readonly mrs: { score: number | null; tier: MrsTier; band: 'high'|'mid'|'low'|'awaiting' };
  readonly pills: PillDerivationResult;                    // canonical, final
  readonly checkIn: { present: boolean; clarity: number|null; emotion: number|null;
                      regulation: number|null; pressure: number|null; outcome: string|null };
  readonly wearable: { present: boolean; fresh: boolean; daysConnected: number };
  readonly freshness: { wearableFresh: boolean; checkInFresh: boolean };
  readonly baselineMode: 'baseline' | 'refined' | 'awaiting';
  readonly divergence: PillDerivationResult['divergence'];
  readonly patternContext: { calendarLoad, calendarPressure, typicalLoadForDow, ... };
  readonly windowMeta: { localDate: string; window: string; timezone: string };
}
export function buildAssessmentContext(...): AssessmentContext;
```
Frozen with `Object.freeze` at construction. Correlation/run id attached for logging.

### `supabase/functions/_shared/signal-pills/derive-pills.test.ts` (characterization)
Pin the current tier output for ~25 fixture inputs covering: HRV-only, sleep-only, clarity-only, cognitive supply-demand cap, physical RHR trend/deviation/sustained-deficit, resilience sleepEfficiency + check-in overlay + cooccurrence + protection goals, cold-start, wearable-not-fresh neutral collapse, physical-reserves displayable-gate collapse, MRS↔pill coherence auto-correction. Run **before** wiring the extraction into `index.ts`; snapshot passes = extraction is behaviour-preserving.

### `supabase/functions/_shared/signal-pills/divergence.test.ts`
- Mind Sharp (objective green: HRV strong, clarity absent or high) + drained check-in (emotion≤2 and regulation≤2) → `divergence[0].pillar === 'decision_readiness'`, direction `objective_better`.
- Aligned green wearable + green check-in → no divergence.
- Objective red + upbeat check-in → divergence `objective_worse`.

### `supabase/functions/_shared/brief-validators.test.ts` (additions)
Strengthened `validateDivergence`:
- REJECT: `"Despite the pressure, the mind feels spent."`
- REJECT: `"Even though today is busy, the mind is tired."`
- REJECT: `"The mind feels spent, but protect the afternoon."`
- ACCEPT: `"You checked in drained, while HRV and clarity support a sharper cognitive read."`
- ACCEPT: `"Objective signals hold steady even though you feel spent."` (both sides named)

Rule: at least one sentence must name a self-report term (`checked in`, `you feel`, `felt`, `self-report`, drained/spent/tired) **and** an objective term (`HRV`, `RHR`, `clarity`, `objective`, `wearable`, `sleep`) with opposing valence (adjectives pulled from `SCORE_VOCAB`). Implemented via sentence tokenisation + tagged term lists, not a global regex.

### `supabase/functions/compute-outer-readiness/assessment-context-flow.test.ts` (new)
End-to-end behavioural test with mocked LLM:
1. Mind Sharp + drained input → LLM prompt captured contains exact final pill tiers `decision_readiness=green, physical_reserves=amber, resilience_capacity=amber` and the string `divergence: objective vs self-report`.
2. Retry prompt on validation reject receives the identical `AssessmentContext.pills` object reference-equal by JSON.
3. Deterministic fallback receives the same context; output body names both objective and self-report sides.
4. `response.signalPills` === persisted `signal_pills` (deep-equal) === `context.pills.pills`.
5. No coherence adjustment fires after copy generation (assert via spy on the reconciler that it was called 0 times in the post-copy phase).

## Edits to existing files

### `supabase/functions/compute-outer-readiness/index.ts`
1. **Hoist pill derivation to run once, before the LLM prompt is built** (~L3900, immediately after MRS score + wearable/check-in signals are finalized, before the userPrompt construction at L4015). Pull the ~40 locals it needs; anything not yet in scope at that point (calendar pattern signals, cooccurrence, etc.) is what actually gets moved up — audit shows all of these are computed before L4015 already except `composedPatternSignals` derivations at L5849–5871, which are simple fallbacks over already-in-scope variables and move cleanly.
2. Build `AssessmentContext` immediately after `derivePills` returns.
3. Replace inline pill block at L5849–6355 with `const { pills, coherence } = assessmentContext;` and reuse.
4. Pass `assessmentContext` into:
   - LLM userPrompt builder — new `=== PILL ASSESSMENT ===` section listing tier + label + top contributors per pill, plus explicit `DIVERGENCE:` line when `context.divergence.length > 0` describing which pillar and which side is which, and `UNREAD:` line listing neutral pills with reason.
   - Retry/repair prompt (currently at ~L5049–5301) — inject the same section.
   - `buildSpecDeterministicBrief` — extend `SpecDeterministicParams` to accept `assessmentContext` and use `context.pills` / `context.divergence` directly instead of re-deriving MRS band + contributors. Deterministic templates gain a divergence-aware branch that names both sides when `divergence.length > 0`.
   - Persistence — pass `context.pills.pills` into the snapshot write; guard revalidates and logs only reason codes, tiers, sourceTypes, date/window, correlation id (no body previews).
5. **Remove** the post-copy coherence auto-correction branch — replaced by pre-copy application inside `derivePills`.
6. Remove `SpecDeterministicParams` fields now redundant with `AssessmentContext` (or make them `Pick<AssessmentContext, ...>` for clarity).

### `supabase/functions/_shared/brief/spec-deterministic-brief.ts`
- Accept `assessmentContext` (optional for back-compat during transition, required after).
- New helper `renderDivergenceBeat(context)` — chooses a template that names objective signal (HRV/RHR/clarity by name) and self-report (feeling/check-in) with opposing valences.
- All output runs through the same validators immediately (`validateNoScoreRestatement`, `validatePillBodyConsistency`, strengthened `validateDivergence`) — no persistence-only rescue.

### `supabase/functions/_shared/brief-validators.ts`
- Replace the global "despite/but/even though" heuristic in `validateDivergence` with `parseDivergenceStatements(body, tokens)`:
  - Tokenise into sentences.
  - Tag each sentence for `objectiveTerm | selfReportTerm | neither`.
  - Require ≥1 sentence containing at least one objective term AND at least one self-report term, or two adjacent sentences that split them with an explicit contrast connector (`while`, `even though`, `despite`, `but`) and opposing valence adjectives.
- Export `SCORE_VOCAB` for reuse by deterministic templates.

## Execution order

```text
signals → MRS → derivePills → AssessmentContext (frozen)
                                    ↓
             ┌──────────────────────┼──────────────────────┐
         LLM prompt          Retry prompt        Deterministic fallback
                                    ↓
                              validators
                                    ↓
                       persistence (pills = context.pills)
                       revalidate as invariant, log reason codes only
```

No tier mutation after `AssessmentContext` is frozen.

## Testing sequence

1. Add characterization suite; run against **current** inline code with a temporary shim that captures inputs → confirm parity fixtures. (Prevents extraction regressions.)
2. Extract to module; rerun — must pass identically.
3. Wire context into prompts + deterministic + persistence.
4. Add divergence, flow, and validator tests.
5. Rerun W1 (24), W2 (12 + 31 Deno), W3 (existing validators, brief_prompt_contract, body_copy, redundancy, validator_loosening).
6. `tsgo` for TS check; Deno test on all `_shared/signal-pills/*` and `compute-outer-readiness/*`.

## Guarantees this delivers (all provable by the new tests)

- LLM prompt contains final pill tiers before any copy is written.
- Retry prompt uses the same frozen context.
- Deterministic fallback consumes the same context and produces divergence-aware copy directly.
- `response.signalPills`, `context.pills.pills`, and the persisted snapshot are the same object graph.
- No `assertPillCoherence` invocation exists downstream of LLM/deterministic output.
- Mind Sharp + drained produces a Brief that names both the objective side (HRV/clarity) and self-report side (drained) with opposing valence — not `awaiting`.
- Persistence guard remains as defence-in-depth, logs only reason codes/tiers/sourceTypes/date/window/correlation id, never body previews.
- W4 (check-in latency) is not touched.

## Risks / deferred

- Moving pill derivation up ~1800 lines may surface a hidden dependency on a variable not yet in scope; the characterization suite catches that before wiring. If a genuine ordering hazard emerges, only the strict inputs get hoisted, not consumers.
- Existing snapshots persisted before this change may have coherence-adjusted tiers that differed from raw derivation; the new pre-copy application makes both paths identical going forward but does not backfill history.
- Divergence template library starts small (Decision Readiness objective-better + objective-worse, mirrored for Physical Reserves); further pillars added in a follow-up if fixtures demand.
