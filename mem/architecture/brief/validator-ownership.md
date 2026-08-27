---
name: brief-validator-ownership
description: Live Brief validator lives inline in compute-outer-readiness/index.ts (validateV61Output). _shared/brief-validators.ts (validateBrief) is now wired into the deterministic fallback path and its rejection is respected. Docs SSOT + consolidation plan in docs/BRIEF_VALIDATOR_SSOT.md.
type: architecture
---

# Brief validator ownership

- LLM production gate: `validateV61Output(...)` inside
  `supabase/functions/compute-outer-readiness/index.ts` (inline closure).
- Deterministic fallback gate: `validateBrief(...)` in
  `supabase/functions/_shared/brief-validators.ts`. If it rejects, the Brief
  falls back to the awaiting-signals state.
- Body length contract owned by `BODY_FOUR_BEAT_CONTRACT` in
  `_shared/brief/copy-vocabulary.ts`: target 45–55 words, absolute max 60.
- Full ownership + still-strict rule inventory + consolidation plan:
  `docs/BRIEF_VALIDATOR_SSOT.md`.
- Regression tests for the loosened rules:
  `supabase/functions/compute-outer-readiness/validator_loosening.test.ts`
  — mirror the inline regex constants; update in lockstep on any change.
- Do not loosen em-dash ban, abstract-system-phrase ban, travel/work
  omission checks, band-gate valence, or four-beat structure without a
  dedicated ticket.
