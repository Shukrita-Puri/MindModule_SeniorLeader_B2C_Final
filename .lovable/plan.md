# Brief Engine — Pre-Launch Implementation (Phases 1–7)

Ground truth is the Phase 0 findings in your brief. Each phase is a separate commit and does not start until the previous gate is green.

## Phase 1 — Validator SSOT cleanup (adjusted to reality)

Verified import graph: `_shared/brief-validators.ts` has three live importers — `compute-outer-readiness/index.ts:58-61` (imports `validateBrief`, `validateNoScoreRestatement`, `validatePillBodyConsistency`), `compute-outer-readiness/turn-b-acceptance.test.ts:9`, and `_shared/brief-validators.test.ts:9`. It is called in production at `index.ts:9130` and `9480`. So step 1.1's "delete it" branch does not apply, and adding `throw` to every exported function would break the live brief path immediately. Correction 1 governs.

- Keep the file and its logic untouched (no threshold or rule edits).
- Header comment instead of the dead-file banner: `// LIVE — imported by compute-outer-readiness/index.ts (validateBrief). Not the four-beat production gate; that is validateV61Output. See docs/BRIEF_VALIDATOR_SSOT.md.`
- Real fix: in `compute-outer-readiness/index.ts` (~9470–9516) remove the unconditional `deterministicBrief = specBuilt`. When `specValidation.ok === false`, fall back to the awaiting state and log family, window, and rejection reason.
- Add inside `validateV61Output`: `// SSOT four-beat validator. Do not create a third validator.`
- Confirm `getLoadShapeOrDefault(null)` returns the light default safely; null-safety fix only if not.
- Update `docs/BRIEF_VALIDATOR_SSOT.md` and `mem://architecture/brief/validator-ownership` — `brief-validators.ts` is live (not retired), its result is now respected on the deterministic path, and consolidation stays deferred.

Gate: no second validator added, deterministic invalid copy no longer ships, existing tests green.

## Phase 2 — Beat 4 completeness and tone

**2A (commit 1)**
- Add a `NARRATIVE_CLOSES` entry for every family missing one. Rules: 3–8 words, imperative, no banned/hedging/wellness vocabulary; evening closes are recovery-only imperatives.
- Replace the four silent drop paths with hard throws: `deterministic-brief.ts:695` (band map), `:670` (CEO-flag close), `behaviour-copy.ts:1155` (`NARRATIVE_CLOSES[family]`), and re-throw after logging at `compute-outer-readiness/index.ts:9518`.
- New contract test: every family in `NARRATIVE_COPY` has a non-empty close.

**2B (commit 2)**
- Rewrite persona-violating closes, starting with `NARRATIVE_CLOSES.visibility_pre.ok` ("breathe" is banned).
- The following closes have soft persona drift (declarative or noun-phrase rather than imperative self-regulation directive) and must be rewritten to imperative register: `conferenceDepletion` (`behaviour-copy.ts:299`), `conferenceDayAttend` (`:314`), `visibilityCommsPrep` (`:330`), `advancePrep24h` (`:412`), `holidayReducedTouch` (`:498`), `multiCalendarLoad` (`:554`). Each rewrite must be 3–8 words, imperative first word, no hedging, no wellness vocabulary.
- All 47 existing contract assertions must still pass after 2B rewrites. If any fail, the rewrite introduced a regression — fix the copy, not the test.

Phase 2 gate: every family has a close, every close passes persona rules, beat 4 throws rather than drops silently, all existing tests pass plus the new missing-close test.

## Phase 3 — Golden-set snapshot tests (test-only)

- Extend `behaviour-copy.contract.test.ts`. 11 families × depletion on/off × 3 windows = 66 realistic fixtures, each with the correct window context object.
- Run each through the deterministic assembly and the rendered prompt string (never the live LLM).
- Named assertions per output: four beats present; no banned vocabulary; anchor named at most once; close 3–8 words; body 45–60 words; at most one `time-phrase.ts` clause; per-window signal eligibility and copy rules (morning/afternoon/evening as specified); load-shape presence, and byte-identical output when load shape is null.
- Extra fixtures: awaiting state → null; zero-event clear day → valid brief; insights-pattern fixture (marked as future assertion until Phase 5).
- Target ≥135 green assertions, run in CI on PRs touching the mapped files.

## Phase 4 — Validator wired into CI only

- CI test passes all 66 deterministic outputs through `validateV61Output`; each must pass. Failures are fixed in the copy pack.
- Header comment in `deterministic-brief.ts` stating this contract. No runtime change.
- Note: `validateV61Output` checks structure and vocabulary, not chief-of-staff tone. The six soft persona-drift closes listed in Phase 2B must be fixed by copy rewrites, not by the validator.

## Phase 5 — Evidence salience ranking

**5A** Create `_shared/brief/rank-brief-evidence.ts` exporting only `rankBriefEvidence(windowContext, family, loadShape, insightPatterns)` returning `RankedSignal[]`. Window candidate sets read from the context builders (they own eligibility; the ranker owns scoring). Salience = deviation×0.5 + familyRelevance×0.3 + bucket-diversity×0.2, with the specified normalisations, elevated floors (0.8) for `vetoRisk` / `decisionLeakageRisk`, `FAMILY_SIGNAL_RELEVANCE` for all 11 families, and a +0.15 pattern bonus. Top two signals from different buckets; empty array when nothing qualifies; pure and sync.
- `InsightPattern` is derived from `Finding` in `cause-effect-engine/index.ts`.
- Pattern gate: a pattern is considered only when its `effectSignal` is present in `EFFECT_SIGNAL_TO_BUCKET`, `n >= 3`, and `confidence >= 0.6`. Unmapped `effectSignal` strings are silently skipped and logged at debug level only; they are not errors and do not enter the ranked list.
- Patterns come from the existing same-day read (~`index.ts:6863`) threaded in — no new query.
- Add `loadShape: LoadShape | null` to `SignalMatrix` in `brief-context.ts`, populated from `fetchRenderableLoadShape()` where `BriefContext` is assembled. No second fetch path.
- Add `// TYPE DRIFT` comments in `behaviour-snapshot.ts` and `window-context-types.ts`; write code against the real producer. No reconciliation this sprint.
- Unit tests per the listed cases, all green before 5B begins.

**5B** Wire into the deterministic path
- In `deterministic-brief.ts`, at the point before `assembleNarrativeBody()` is called, add:

```typescript
const rankedEvidence = rankBriefEvidence(
  windowContext,
  resolvedNarrative.family,
  getLoadShapeOrDefault(signals.loadShape),
  insightPatterns,   // pass through from caller; empty array if not yet available
);
const primarySignal = rankedEvidence[0] ?? null;
const secondarySignal = rankedEvidence[1] ?? null;
```

- The window context object must already be resolved before this point. If it is not currently threaded into `deterministic-brief.ts`, thread it through from the caller. Do not re-derive it inside `deterministic-brief.ts`.
- Pass `primarySignal` and `secondarySignal` into `assembleNarrativeBody()`. Beat (a) Evidence uses `primarySignal`. Beat (b) Read uses `secondarySignal`. If either is null, the beat falls back to the existing behaviour — do not break the fallback, do not throw on null signals.
- If `rankBriefEvidence` returns an empty array, `assembleNarrativeBody` must still produce a valid four-beat brief using the existing branch-order signal selection. This is not an error path, not an awaiting state, and beat 4 must not be dropped. The Phase 3 golden-set must include at least one fixture with no eligible signals that produces a valid four-beat brief via this fallback.
- In `behaviour-copy.ts`, update `renderNarrativeBeats()` and `assembleNarrativeBody()` to accept `primarySignal: RankedSignal | null` and `secondarySignal: RankedSignal | null` as typed parameters. They use these for beat selection rather than reading from the snapshot directly.
- Do not move or remove `contextSwitchingCost` or `backToBackLoadOverride` from anywhere they currently exist. The load shape signal enters via `rankBriefEvidence` as a new candidate — it does not replace existing references.
- Rerun all Phase 3 golden-set tests. All 135 must still pass.

**5C** Wire into the LLM prompt
- Before implementing 5C, identify and comment the exact prompt block being replaced in `compute-outer-readiness/index.ts` (likely the BUCKET 3 signal context block around `index.ts:7185–7289` based on Phase 0 findings). Confirm no other prompt block references the same signals. If overlap exists, report it before proceeding.
- At the identified block, replace the current free-form signal context with the ranked evidence list rendered as an ordered block: primary signal first, secondary signal second, remaining signals after in rank order.
- The prompt instruction for the model: lead beat (a) on the primary signal, lead beat (b) on the secondary signal. Name these beats explicitly in the prompt.
- Include `patternReinforced: true` signals in the prompt block with a note: "The user has a confirmed insight pattern related to this signal — it may inform the Read beat but must not be stated as a causal claim."
- Do not change any other part of the LLM prompt. Do not change the model. Do not change `validateV61Output`. This is a bounded substitution of one prompt block.
- The window context object and load shape must be resolved before the prompt is assembled. Thread them through if not already present.

Phase 5 gate: `rankBriefEvidence` exists with green unit tests, wired into both paths, Phase 3 tests still green, no schema changes.

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

## Definition of done

- Zero TypeScript errors across modified files
- All 47 existing behaviour-copy.contract assertions still pass
- 137 golden-set assertions green
- CI blocks on deterministic validator failure (Phase 4)
- `rankBriefEvidence` unit tests green and both paths consume it (Phase 5)
- Load-shape kill switch verified (Phase 3 + 7)
- Zero-event clear day → brief; unresolved calendar → awaiting (Phase 6)
- Smoke check documented in source (Phase 7)
- Beat 4 throws rather than silently drops for any missing family
- Every narrative family has a close entry passing persona rules
- Window gating enforced at both L5.5 (candidate set) and L6 (vocabulary) independently

## Scope containment — no other surface is touched

This work is Brief-engine only. No change to the Plan, Smart Nudges, Insights, or MRS features:

- Files in scope: `_shared/personas/ceo/behaviour-copy.ts`, `_shared/brief/*` (incl. the new `rank-brief-evidence.ts`), `_shared/brief-context.ts` (add `loadShape` field only), `_shared/brief-validators.ts` (comment only), `_shared/signal-engine/behaviour-snapshot.ts` + `window-context-types.ts` (comment + `calendarResolved` type field), `compute-outer-readiness/index.ts`, docs and tests.
- Explicitly not modified: `generate-mastery-plan`, `smart-nudges`, `cause-effect-engine` (read-only import of its `Finding` type), MRS v4 scoring, `list-week-ahead-priorities`, and all Insights/Plan/Nudge frontend components.
- `SignalMatrix.loadShape` is additive and optional-by-null, so existing Plan/Nudge consumers of `brief-context.ts` keep identical behaviour.
- Adding `calendarResolved` to `BehaviourSnapshot` must not change any value the Plan or Nudges already read from that snapshot.
- After each phase, re-run the full existing test suite to confirm no cross-surface regression.

## Deployment cadence

Each phase is deployed on its own, not batched:

1. Land the phase's code and tests.
2. Run typecheck plus the full test suite; the phase gate must be green.
3. Deploy only the edge functions that phase actually changed (Phases 1, 5C, 6 touch `compute-outer-readiness`; Phases 2 and 5B touch the shared modules it and any other brief-consuming function import, so those get redeployed together for that phase).
4. Verify the deployed function responds and the Brief still renders before starting the next phase.

Phases 3 and 4 are test/CI-only and require no deployment.
