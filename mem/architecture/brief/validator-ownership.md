---
name: brief-validator-ownership
description: Live Brief validator lives inline in compute-outer-readiness/index.ts (validateV61Output). _shared/brief-validators.ts is NOT the production gate. Docs SSOT + consolidation plan in docs/BRIEF_VALIDATOR_SSOT.md.
type: architecture
---

# Brief validator ownership

- Production gate: `validateV61Output(...)` inside
  `supabase/functions/compute-outer-readiness/index.ts` (inline closure).
- Body length contract owned by `BODY_FOUR_BEAT_CONTRACT` in
  `_shared/brief/copy-vocabulary.ts`: target 45–55 words, absolute max 60.
- `_shared/brief-validators.ts` is a parallel implementation, NOT wired.
- Full ownership + still-strict rule inventory + consolidation plan:
  `docs/BRIEF_VALIDATOR_SSOT.md`.
- Regression tests for the loosened rules:
  `supabase/functions/compute-outer-readiness/validator_loosening.test.ts`
  — mirror the inline regex constants; update in lockstep on any change.
- Do not loosen em-dash ban, abstract-system-phrase ban, travel/work
  omission checks, band-gate valence, or four-beat structure without a
  dedicated ticket.
