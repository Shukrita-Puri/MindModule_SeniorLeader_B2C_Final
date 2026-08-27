# Deterministic Brief — closing the remaining 90 golden-set failures

## Measured breakdown first (as requested)

Ran the diagnostic harness over the 171-fixture matrix. 90 failures, by validator rejection reason:

| Count | Rejection reason | Category |
|---|---|---|
| 52 | `body has 4 sentences` (1 case: 5 sentences) — four-beat contract expects 1–3 | Multi-sentence Read/Directive banks |
| 17 | `body missing WORK DIRECTIVE beat (directive is not tied to a work context)` | Directive bank wording |
| 10 | `body references wearable evidence when no wearable signal exists` | Harness/validator-context gap |
| 5 | `pattern reference present without today-signal or today-context anchor` | Copy + context |
| 3 | `body missing WORK DIRECTIVE beat (no work-facing directive verb)` | Directive bank wording |
| 3 | `body references check-in evidence when no current check-in exists` | Harness/validator-context gap |

Two findings that correct the working assumption in the brief:

- **There are zero `body_no_signal_evidence` and zero `body_no_lexicon_cluster` failures.** The `lexiconFallbackClause` / `ensureCloseLexicon` work already closed both gates; no further lexicon gating is needed on Evidence or Read sentences. The collapsed Evidence sentences do still name a signal (meeting counts, hours without a gap, room counts, the anchor event title), which is why the evidence gate passes.
- **The remaining "validator-context gaps" are 13 failures and are a harness defect, not a copy defect.** `golden-set.test.ts` (and `diagnose_golden.ts`) build fixtures with `hasWearable: true` / `hasCurrentCheckIn: true`, but pass a `BriefContext` whose `signals` only contains `highStakesEventInNext24h`. `validateBodyDataAvailability` therefore sees no `hrvDeviationPct` / `sleepHours` / `emotionalSelfDeclared` and rejects copy that legitimately quotes recovery and felt state. The same missing fields also cause the 5 pattern-reference rejections in bodies that carry no digit.

So the larger gap is unambiguously the **multi-sentence banks (72 of 90 once the directive-token failures are counted with them)**; the context gap is 18.

## What to change

### 1. Collapse Read banks to one sentence (52 failures)
`NARRATIVE_READS` in `supabase/functions/_shared/personas/ceo/behaviour-copy.ts` still holds two-sentence reads, e.g. `"The sessions are not the load. The people between them are."` and `"Few rooms, large consequence. Today is about depth, not throughput."`. Apply the same `nOneSentence` collapse already used for Evidence: join the two clauses with an em dash or semicolon so each read is one clause with one verb (`"The sessions are not the load — the people between them are."`).

### 2. Collapse Directive banks to one instruction (part of the 52, plus grammar)
Directive strings that embed a second sentence — e.g. `"... comes first — the board call. Everything after it can be listening"` — get folded into a single clause (`"... comes first — the board call, and everything after it can be listening"`). One verb, one instruction per beat.

### 3. Add work context / directive verbs to the failing directive banks (20 failures)
The conference and evening directives that fail are protective-only closes ("take the breaks you are given", "skip the drinks tonight", "close the day here"). Rewrite these so the directive beat names a work object drawn from `WORK_CONTEXT_TOKENS` (sessions, rooms, calls, decisions, the anchor event) and leads with a directive verb from `WORK_DIRECTIVE_TOKENS`. The self-regulation close stays as the short tail after the final connector.

### 4. Fix the golden-set validator context (13 + 5 failures)
In `golden-set.test.ts` and `diagnose_golden.ts`, populate the `signals` object to match the fixture inputs: when `hasCurrentWearable` is true supply `sleepHours` / `hrvDeviationPct` / `rhrDeviationPct`; when `hasCurrentCheckIn` is true supply `emotionalSelfDeclared`, `mentalSharpness`, `confidence`. This makes the harness represent the real production call shape, where `compute-outer-readiness` passes the same signals it used to build the brief. Fixtures that are meant to test the no-wearable path get an explicit no-signal variant instead.

### 5. Re-run and lock
Re-run the diagnostic to confirm 0/171 failures, then run the Deno contract test (`behaviour-copy.contract.test.ts`) and the golden-set test so CI blocks regressions. No re-deploy is required for the test files; `deterministic-brief.ts` / `behaviour-copy.ts` changes ship with the next `compute-outer-readiness` deploy.

## Files touched

- `supabase/functions/_shared/personas/ceo/behaviour-copy.ts` — Read and Directive bank collapse, work-context directive rewrite
- `supabase/functions/_shared/brief/deterministic-brief.ts` — only if a generic close needs the same single-sentence treatment
- `supabase/functions/compute-outer-readiness/golden-set.test.ts` — signal-complete validator context
- `diagnose_golden.ts` — mirror the same context

Validator source (`_shared/brief-validators.ts`) is not changed — the contract stays as-is and the copy is made to satisfy it.
