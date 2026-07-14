# Post Stage 1 Server Hardening Investigation

Date: 2026-07-14
Scope: backend contract review after Stage 1 fixes for Bugs 1, 2, and 3.

## Findings

### 1. Evening `horizon_modules` persistence

Finding:
`supabase/functions/generate-mastery-plan/index.ts` persists snapshot readiness from `hasPayload`, where `hasPayload` is true when either `planObj.horizonModules` OR `planObj.timeOfDayPlan.modules` is populated. The actual persisted `horizon_modules` column is sourced only from `planObj.horizonModules`.

Implication:
The server can upsert a `mastery_plan_snapshots` row with:

- `status='ready'`
- `timeOfDayPlan.modules.length > 0`
- `horizon_modules = []`

This is not expected final-contract behaviour for consumers that treat `horizon_modules` as the canonical persisted projection. It behaves like a persistence / projection omission, not a rendering defect.

Evidence:

- Persistence block: `supabase/functions/generate-mastery-plan/index.ts`
- Client fallback path exists only because snapshot projection can be empty:
  `src/components/home/TodayThreePriorities.tsx`

Recommendation:
Do not re-shape `timeOfDayPlan.modules` directly into `horizon_modules` without documenting the server contract first. `timeOfDayPlan.modules` contains raw practice/module rows, while `horizon_modules` is a richer slot projection. The immediate contract decision is whether:

1. `horizon_modules` is mandatory for every non-rest-day ready row, or
2. empty `horizon_modules` with populated `timeOfDayPlan.modules` is an allowed transitional state.

Priority:
Immediate

### 2. MRS snapshot consolidation

Finding:
`supabase/functions/compute-outer-readiness/index.ts` still writes both:

- `daily_context_snapshot` via `upsertDailyContextSnapshot(...)`
- `brief_snapshots` score/tier mirrors

The function now preserves and reuses an existing ready MRS row to keep the two stores aligned, but the architecture still has dual persisted score writers.

Implication:
The frontend MRS preference masks the duplication. The code is actively compensating for divergence instead of eliminating the root source.

Recommendation:
Make `daily_context_snapshot` the canonical persisted score authority and treat `brief_snapshots` as copy/presentation storage. The brief write should mirror canonical MRS values, never originate an independent score decision.

Priority:
Stage 2

### 3. Server-side Why-line validation

Finding:
Server-side validation already exists in `supabase/functions/_shared/plan/why-llm.ts` and is invoked from `generate-mastery-plan`. It already rejects exact echoes against slot label, practice title, and recommended action before accepting LLM output.

Gap:
The previous exact-echo normalization was too literal. Punctuation-only or markdown-only variants could still sneak through.

Action taken:
Hardened the server validator so echo checks ignore markdown punctuation, casing, and repeated whitespace. This keeps the client guard as a safety net but makes the server rejection closer to the shipped frontend behaviour.

Priority:
Immediate

### 4. Telemetry

Finding:
Current diagnostics are mostly ad hoc console logs:

- client: `[decision-readiness-brief] mrs_override`
- client: `[today-three-priorities] whyline_title_echo`
- server: `[why-llm.telemetry] ...`
- server: `[mastery-plan-snapshot][non-rest-day-empty-payload]`

Recommendation:

- Keep server telemetry for `why-llm` rejection reasons and empty projection writes.
- Convert client-only diagnostics into short-lived rollout telemetry, then remove them once server metrics are trustworthy.
- Prefer structured payload logs over freeform strings for any telemetry kept long-term.

Priority:
Stage 2

## Risk Assessment

### Immediate risk

- Non-rest-day `ready` snapshot rows can still persist with empty `horizon_modules`, leaving downstream readers dependent on fallback reconstruction.
- Dual score persistence remains a latent regression source if any surface stops preferring the canonical MRS row.

### Medium-term risk

- As long as `brief_snapshots` and `daily_context_snapshot` both participate in score persistence, future feature work can reintroduce mismatch by bypassing the preservation logic.
- Why-line server validation existed, but without stronger normalization it was still possible for near-identical echoes to survive.

## Recommended Implementation Plan

1. Immediate
   - Document the `mastery_plan_snapshots` ready-row contract for `horizon_modules`.
   - Keep and monitor `non-rest-day-empty-payload` server warnings.
   - Keep the new server-side Why-line normalization in place.

2. Stage 2
   - Refactor `generate-mastery-plan` so every non-rest-day ready row persists a real `horizon_modules` projection.
   - Collapse readiness score ownership onto `daily_context_snapshot`.
   - Replace temporary client diagnostics with server-owned structured telemetry.

3. Future technical debt
   - Unify the Plan snapshot projection builder so persistence and response shaping cannot drift.
   - Reduce duplicate score-mirroring logic inside `compute-outer-readiness`.

## Files Requiring Modification

### Immediate

- `supabase/functions/_shared/plan/why-llm.ts`
- `supabase/functions/_shared/plan/why-llm-validator.test.ts`

### Stage 2

- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/compute-outer-readiness/index.ts`
- `supabase/functions/_shared/signal-engine/build-daily-context.ts`
- `src/components/home/DecisionReadinessBrief.tsx`
- `src/components/home/TodayThreePriorities.tsx`

### Future Technical Debt

- shared plan projection helpers once extracted from `generate-mastery-plan`

