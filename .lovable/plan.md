# Brief provenance logging + architecture doc refresh

Two additive changes. No scoring, gating, schema, or copy behaviour changes.

## 1. Structured provenance logging for every deterministic brief

Today the deterministic path logs only failures. There is no way to tell, from
logs, which taxonomy layer named an event or whether the user's learning store
contributed. This adds one structured line per generated brief.

**What gets recorded**

- Taxonomy / A–H SSOT usage: for the anchor event and each event that reached a
  sentence — the resolver layer that won (`user_override`, `learned_token`,
  `layer3_persisted`, `classifier`, `unresolved`), the resolved category id,
  subcategory, and confidence. These come straight off `resolveEvent()`'s
  existing `source` / `confidence` fields; nothing is re-derived.
- Learning-store branches: whether the primed learning context was present,
  how many confirmed titles and promoted tokens it held, and which branch
  produced each hit (`user_override`, `plan_slot`, `resolver`,
  `token_generalisation`).
- Copy provenance: branch (`narrative` vs `generic`), narrative family,
  day shape, window, band, variant seed, whether window context was supplied,
  and whether the timing clause was spent.
- Producer outcome: `llm_accepted`, `llm_rejected -> deterministic`, or
  `deterministic_direct`, plus attempt count and rejection codes when relevant.

**How**

- `deterministic-brief.ts` returns an extra optional `provenance` object on
  `DeterministicBriefResult` — populated from values it already has in scope.
  No control flow changes; consumers that ignore it are unaffected.
- `compute-outer-readiness/index.ts` emits one line after the brief resolves:
  `[brief-provenance] {json}` with the user id passed through
  `redactUserId()`. No titles, no raw event text, no secrets — category ids and
  counts only.
- Logging is wrapped so a provenance failure can never fail brief generation.

## 2. Rewrite the flow section of the architecture audit

`docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md` currently describes the path at a
high level. Section 3 ("Current end-to-end path") is replaced with a precise,
numbered walkthrough covering both producers:

- Request entry, auth, and the learning-context priming step.
- Signal resolution: wearable freshness, check-in currency, calendar dedupe and
  load classification, MRS state.
- A–H inference: the five resolution layers in order, where the learning store
  sits, and what an unresolved event means downstream.
- Window context build (morning / afternoon / evening) and what each window may
  quote.
- Narrative resolution: which scenario family fires and why.
- LLM path: prompt assembly, model ladder and each fallback hop, validator
  gating, and the exact retry/loop count at every stage.
- Deterministic path: narrative branch vs generic four-beat branch, timing
  spend, lexicon enforcement.
- Snapshot write, replay-by-signature, manual refresh bypass, and the frontend
  cache — including which loops exist there.
- A single "loop inventory" table: every retry or repeat in the chain with its
  bound.
- A provenance section documenting the new log line and how to read it.

Version header bumped; the v7.7 addendum is retained.

## Verification

- Focused Deno suites for `_shared/brief` and `_shared/personas` stay green.
- Golden-set and validator harnesses stay green (unchanged output).
- One live invocation reviewed in function logs to confirm the provenance line
  renders and carries no identifying text.
- Redeploy `compute-outer-readiness` only after the suites pass.
