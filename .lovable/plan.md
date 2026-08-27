# Brief Engine — Pre-Launch Implementation (Phases 1–7)

Ground truth is the Phase 0 findings in your brief. Each phase is a separate commit and does not start until the previous gate is green.

## Phase 1 — Respect the validator on the deterministic path
- `_shared/brief-validators.ts` stays (three live importers). No validator or threshold changes.
- In `compute-outer-readiness/index.ts` (~9470–9516): remove the unconditional `deterministicBrief = specBuilt`. When `specValidation.ok === false`, fall back to the awaiting state and log family, window, rejection reason.
- Confirm `getLoadShapeOrDefault(null)` returns the light default safely.
- Update `docs/BRIEF_VALIDATOR_SSOT.md`: brief-validators.ts is live and its result is now respected.

Gate: deterministic invalid copy no longer ships; existing tests green.

## Phase 2 — Beat 4 completeness and tone
**2A (commit 1)**
- Add a `NARRATIVE_CLOSES` entry for every family missing one. Rules: 3–8 words, imperative, no banned/hedging/wellness vocabulary; evening closes are recovery-only imperatives.
- Replace the four silent drop paths with hard throws: `deterministic-brief.ts:695` (band map), `:670` (CEO-flag close), `behaviour-copy.ts:1155` (`NARRATIVE_CLOSES[family]`), and re-throw after logging at `compute-outer-readiness/index.ts:9518`.
- New contract test: every family in `NARRATIVE_COPY` has a non-empty close.

**2B (commit 2)**
- Rewrite persona-violating closes, starting with `NARRATIVE_CLOSES.visibility_pre.ok` ("breathe" is banned).
- All 47 existing contract assertions must still pass; fix copy, never tests.

## Phase 3 — Golden-set snapshot tests (test-only)
- Extend `behaviour-copy.contract.test.ts`. 11 families × depletion on/off × 3 windows = 66 realistic fixtures, each with the correct window context object.
- Run each through the deterministic assembly and the rendered prompt string (never the live LLM).
- Named assertions per output: four beats present; no banned vocabulary; anchor named at most once; close 3–8 words; body 45–60 words; at most one `time-phrase.ts` clause; per-window signal eligibility and copy rules (morning/afternoon/evening as specified); load-shape presence, and byte-identical output when load shape is null.
- Extra fixtures: awaiting state → null; zero-event clear day → valid brief; insights-pattern fixture (marked as future assertion until Phase 5).
- Target ≥135 green assertions, run in CI on PRs touching the mapped files.

## Phase 4 — Validator wired into CI only
- CI test passes all 66 deterministic outputs through `validateV61Output`; each must pass. Failures are fixed in the copy pack.
- Header comment in `deterministic-brief.ts` stating this contract. No runtime change.

## Phase 5 — Evidence salience ranking
**5A** `_shared/brief/rank-brief-evidence.ts` exporting only `rankBriefEvidence(windowContext, family, loadShape, insightPatterns)` returning `RankedSignal[]`. Window candidate sets read from the context builders (they own eligibility; the ranker owns scoring). Salience = deviation×0.5 + familyRelevance×0.3 + bucket-diversity×0.2, with the specified normalisations, elevated floors (0.8) for `vetoRisk` / `decisionLeakageRisk`, `FAMILY_SIGNAL_RELEVANCE` for all 11 families, and a +0.15 pattern bonus. Top two signals from different buckets; empty array when nothing qualifies; pure and sync.
- `InsightPattern` is derived from `Finding` in `cause-effect-engine/index.ts`; gated at `n >= 3` and `confidence >= 0.6` via an `EFFECT_SIGNAL_TO_BUCKET` map. Patterns come from the existing same-day read (~index.ts:6863) threaded in — no new query.
- Add `loadShape: LoadShape | null` to `SignalMatrix` in `brief-context.ts`, populated from `fetchRenderableLoadShape()` where `BriefContext` is assembled. No second fetch path.
- Add `// TYPE DRIFT` comments in `behaviour-snapshot.ts` and `window-context-types.ts`; write code against the real producer. No reconciliation this sprint.
- Unit tests per the listed cases, all green before 5B.

**5B** Thread the resolved window context into `deterministic-brief.ts`, call the ranker before `assembleNarrativeBody()`, pass primary/secondary signals into `renderNarrativeBeats`/`assembleNarrativeBody` as typed params. Null signals fall back to existing behaviour. `contextSwitchingCost` and `backToBackLoadOverride` stay untouched. Phase 3 tests re-run green.

**5C** In `compute-outer-readiness`, replace only the signal-context prompt block with the ranked list (primary → beat a, secondary → beat b), plus the pattern caveat line for `patternReinforced` signals. No other prompt, model, or validator change.

## Phase 6 — Zero calendar events
- Document current zero-row behaviour in `behaviour-snapshot.ts`; add `calendarResolved: boolean` to the TypeScript type (no DB change).
- `briefMustAwait`: `false` → await, `true` with empty events → proceed; other conditions unchanged.
- Ensure `resolveLeadNarrative` can resolve a zero-event day from body signals alone; add that path only if it currently fails.
- Golden fixtures 136 and 137.

## Phase 7 — Fallback smoke check
- Non-production / nominated-test-account-only flag forcing the deterministic path; impossible to hit for real users.
- Verify three families per window, awaiting state, zero-event clear day, both load-shape fixtures; record results in the header comment block of `deterministic-brief.ts`.

## Constraint conflict to resolve
"Exactly one validator in the codebase" (Definition of Done) contradicts Correction 1, which forbids deleting `brief-validators.ts` because it has three live importers. Plan follows Correction 1: both validators remain, `validateV61Output` stays the production gate, consolidation is deferred and recorded in `docs/BRIEF_VALIDATOR_SSOT.md`. Say the word if you want consolidation attempted instead.

## Constraints honoured throughout
No new tables, no schema migrations, no validator logic/threshold edits, no MRS v4 or model changes, `family-copy.ts` never recreated, load-shape kill switch (null → byte-identical output) live at all times, every change covered by a test.
