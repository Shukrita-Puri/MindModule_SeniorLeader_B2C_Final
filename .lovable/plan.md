## Goal

Make `supabase/functions/_shared/` the single source of truth for the CEO Self-Regulation rules (§2.11–§2.17), signal coverage (§3.x), Elastic Lexicon (§2.20), and validators (§5). Slim the brief / nudge / plan prompts so the LLM does only what an LLM is good at — voice, synthesis, constraint — and reads pre-evaluated `behaviourFlags` from code. Done in three phases behind a feature flag, with the current prompts captured as ground truth before any slim.

## Pre-flight (mandatory, no code yet)

- Snapshot the current prompts verbatim into `mem/features/performance-readiness/` as `prompt-snapshot-brief.md`, `prompt-snapshot-nudges.md`, `prompt-snapshot-plan.md`. These are the rollback reference.
- Diff each snapshot against the framework spec doc (v6.1 for the brief). Log every gap in the snapshot file under a `### Spec gaps found` heading. Do not fix gaps in pre-flight — fix them in the right phase below.
- Add a top-of-file ownership banner to each new `_shared/` module (Phase 1):
  ```ts
  // OWNERSHIP: engineering. Trigger logic / thresholds change via code review only.
  // Do not edit in a chat-driven session without an explicit human request.
  ```

## Architecture

```text
supabase/functions/_shared/
  executive-state-taxonomy.ts        already canonical
  ceo-behaviour-rules.ts             NEW — one pure fn per §2.11–§2.17
  behaviour-evaluator.ts             NEW — evaluate(ctx) → BehaviourFlags[]
  brief-signal-coverage.ts           NEW — §3 matrix incl. §3.11/§3.12/§3.13
  copy-vocabulary.ts                 NEW — Elastic Lexicon + forbidden words
  brief-validators.ts                NEW — §5.1 / §5.2 validators
  brief-context.ts                   NEW — BriefContext interface (the API contract)
```

`BriefContext` is the typed contract every consumer reads from and the LLM sees as JSON:

```ts
export interface BriefContext {
  signals: SignalMatrix;                  // §3 + §3.11–§3.13
  behaviourFlags: BehaviourFlag[];        // sorted by severity desc
  lexiconClusters: PillarCluster[];       // resilience | cognition | physiology
  forbiddenWords: string[];
  allowedPatternKeywords: string[];
  suggestedSlotBoosts?: SlotBoost[];      // consumed by Plan, ignored by Brief
}

export interface BehaviourFlag {
  rule: "vetoRisk" | "secondWind" | "circadianPriority"
      | "decisionLeakageGuard" | "postPeakHangover"
      | "personalFrictionInference" | "boardLevelOutcome";
  severity: "low" | "medium" | "high";
  evidence: string[];
  anchorEvent?: string;
  stake?: string;
  copyHint: string;
}
```

`copyHint` is the load-bearing field: it replaces the §2.11–§2.17 prose in the prompt. The LLM stops re-evaluating booleans under generation pressure and just executes craft + constraint.

## Phase 1 — Shared modules (no behaviour change)

Scope of the Lovable session: "Add these files. Do not edit any existing function files. Do not change any prompt strings."

1. `brief-context.ts` — interfaces only.
2. `ceo-behaviour-rules.ts` — pure functions, one export per §2.11–§2.17 rule. Each returns `BehaviourFlag | null`. §2.16 Personal Friction stays a stub returning `null` until ≥3 weeks of data is available.
3. `behaviour-evaluator.ts` — `evaluate(ctx)` runs all rules, returns flags sorted by severity, deduped.
4. `brief-signal-coverage.ts` — assembles the §3 matrix from existing inputs (wearable, check-in, calendar, profile, pattern store), §3.11 emotional triangulation (self-decl carries when wearable null), §3.12 timezone-only globalLoad (others null), §3.13 `postPeakWindow` + `isHighVisibilityToday`.
5. `copy-vocabulary.ts` — three pillar clusters (Cognition / Physiology / Resilience), forbidden words, allowed pattern-reference keywords. Migrate `smart-nudges` `FORBIDDEN_WORDS_V6` to import from here in Phase 3 — do not edit nudges in Phase 1.
6. `brief-validators.ts` — §5.1 phrase + §5.2 body validators. Pure, unit-testable.

Deno tests per rule covering the trigger truth tables, plus snapshot tests for `evaluate(ctx)` on five fixtures: Board day + masked fatigue, midday recovery on a compressed morning, ≥3h TZ drift, emotional drain + low self-decl, post-peak hangover.

**Exit criteria:** `deno test` green, zero edits outside `_shared/`, no prompt strings touched.

## Phase 2 — Brief wiring (separate session, behind feature flag)

Scope: only `compute-outer-readiness/index.ts`.

1. Add env flag `SHARED_MODULES_ENABLED` (default `false`).
2. When the flag is on:
   - Build `BriefContext` from `behaviour-evaluator` + `brief-signal-coverage`.
   - Replace inline §2.11–§2.17, §3.11–§3.13, §5 prose with the slim 3-block prompt:
     - **Block 1 — Role + Contract** (~150 tokens, never changes)
     - **Block 2 — `briefContext` JSON** (~200–350 tokens, variable)
     - **Block 3 — Generation rules** (~200 tokens, §2.1–§2.2, §2.18–§2.22 only)
   - The LLM's instruction for behaviour-driven copy is: "If `behaviourFlags` is non-empty, the highest-severity flag drives the directive. `copyHint` is your framing instruction — use it, do not quote it."
3. After LLM returns, run `brief-validators` in code. On failure, retry once with an explicit corrective message ("you produced X, the validator rejected it because Y, regenerate honouring constraint Z"), then fall through to next provider, then deterministic `getTheme()`. Atomic Brief Contract preserved.
4. Stamp telemetry: `brief_snapshots.prompt_version = 'v6.1-shared-modules'` when flag on; legacy value otherwise. Never pool the two for analysis.

**Exit criteria:**
- Flag off in production at merge time.
- Three consecutive passing runs in staging against the canonical fixture (Board day, HRV −22%, sleep 5h40m, sharpness 4/5) → output references "Board" and a Resilience-cluster word.
- Existing `compute-outer-readiness` `index.test.ts`, `body_copy.test.ts`, `redundancy.test.ts` still pass with flag off.
- Per `mem://reliability/brief-prompt-variable-scoping.md`, every variable interpolated into the new prompt is declared in the same outer scope as `userPrompt`.

Flip the flag on only after staging checks pass. Monitor validator failure rate for 48h; rollback by flipping flag off.

## Phase 3 — Nudges + Plan (additive, lowest risk)

Two separate sessions. Nudge first (smaller surface), then plan.

### 3a. `smart-nudges/index.ts`

- Replace inline `FORBIDDEN_WORDS_V6` with import from `copy-vocabulary.ts` (single source of truth). Keep V8 CTA verbs in a separate `cta-vocabulary` export — do NOT couple them to the forbidden list.
- Call `evaluate(ctx)` once per nudge build. When a high-severity flag exists for the nudge's anchor:
  - Pass `copyHint` + `anchorEvent` + `stake` into the existing AI copy prompt.
  - No new slot, no comparator change, no scheduling change.
- For the JIT-nudge path only, evaluate whether Haiku reliably honours `copyHint`. If degraded, swap that path to Sonnet; Nudge 1 / Nudge 3 stay on Haiku.

### 3b. `generate-mastery-plan/index.ts`

- Read `behaviourFlags` (severity + stake only — no `copyHint`, the Plan does not write LLM copy at the same scale).
- `vetoRisk.high` → boost a Pause module into slot 1.
- `postPeakHangover.high` → boost a Reenergise module into slot 3.
- `composeWhyLine` receives `stake` so the deterministic Why line names the leadership variable.
- `generate-jit-events`: when `boardLevelOutcome` fires for a JIT's anchor event, force `signalStrength = 3` (existing pattern-promotion mechanism).

**Exit criteria:**
- Same fixture run through brief + nudge + plan produces consistent anchor event + stake language across all three surfaces.
- No regression in existing nudge / plan tests.

## What the LLM still owns

- §2.1–§2.2 Persona + Strategic Register (DO/DON'T)
- §2.18 Phrase craft target ("high-velocity 2–3 word")
- §2.19 synthesis of Signal Evidence + Pillar + Stake into 2–3 sentences
- §2.19.1 *how* to weave a pattern reference (the relevance gate is enforced by `brief-validators`, not by the LLM)
- §2.21 generative-not-verbatim
- §2.22 Baseline Intelligence pivot copy direction

Everything else moves to code.

## Out of scope

- A dedicated "behaviour" edge function (rejected — adds HTTP latency + failure surface; the shared-module pattern is already proven across 7 functions).
- §2.16 Personal Friction beyond a stub (needs ≥3 weeks of per-user history).
- Multi-Calendar Load Distortion, conference day-counter, good-vs-bad-stress (deferred per framework doc).
- Changes to the Atomic Brief Contract, fallback chain order, or JSON output shape.
- Changes to nudge slot model, comparator, scheduling, DND/quiet-hours, or weekend cadence.

## Files touched

NEW (Phase 1):
- `supabase/functions/_shared/brief-context.ts`
- `supabase/functions/_shared/ceo-behaviour-rules.ts`
- `supabase/functions/_shared/behaviour-evaluator.ts`
- `supabase/functions/_shared/brief-signal-coverage.ts`
- `supabase/functions/_shared/copy-vocabulary.ts`
- `supabase/functions/_shared/brief-validators.ts`
- Deno tests for each (one `_test.ts` per module)

EDIT (Phase 2):
- `supabase/functions/compute-outer-readiness/index.ts`

EDIT (Phase 3):
- `supabase/functions/smart-nudges/index.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/generate-jit-events/index.ts`

DOCS:
- `mem/features/performance-readiness/prompt-snapshot-brief.md` (NEW, pre-flight)
- `mem/features/performance-readiness/prompt-snapshot-nudges.md` (NEW, pre-flight)
- `mem/features/performance-readiness/prompt-snapshot-plan.md` (NEW, pre-flight)
- `mem/features/performance-readiness/brief-logic.md` (EDIT — note shared-module split)
- `mem/architecture/ceo-behaviour-shared-module-ownership.md` (NEW — codifies "engineering-owned, no chat-driven trigger edits")
- `.lovable/plan.md` (EDIT — changelog)

## Verification

- Phase 1: Deno unit tests for each rule's truth table; snapshot test for `evaluate()` on five fixtures.
- Phase 2 staging: canonical fixture produces brief containing "Board" + Resilience-cluster word, three runs in a row. `prompt_version` telemetry confirms the new path executed.
- Phase 2 production rollout: flag on for 10% of users for 24h; compare validator-failure rate and `delivery_state` distribution against the prior 7-day baseline before going to 100%.
- Phase 3: end-to-end fixture run — same anchor event + stake language surfaces in brief, JIT nudge, and morning plan slot 1.
- Regression: all existing `compute-outer-readiness`, `smart-nudges`, `generate-mastery-plan` tests pass.

## Rollback

- Phase 2: flip `SHARED_MODULES_ENABLED=false`; brief returns to legacy prompt with zero code revert.
- Phase 3: nudge + plan changes are additive; remove the `behaviourFlags` read to revert. Forbidden-list source-of-truth move is the only non-additive change — keep a one-commit revert tagged.
