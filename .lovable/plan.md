# CEO Behaviour → Brief Copy — Implementation (Prompts 1, 2, 3)

Three sequential units. Each is completed and verified before the next starts.

## Pre-checks already done

- `_shared/personas/` does not exist yet — both reference files are new files, nothing to merge.
- No `behaviourPriority` (or equivalent flag-ranking helper) exists anywhere in the repo, including the Plan's JIT v2 — so the ordering is written once in the shared evaluator and the Plan reads the same export.
- JIT v2 has its own `classifyEventBucket` in `_shared/jit/tactical-signals.ts` — that is a JIT-local tactical bucket, **not** the A–H resolver. The canonical A–H classifier is `classifyEvent` / `enrichEvent` in `_shared/events/`, already imported by `compute-outer-readiness`. The Brief wiring uses that one; no new classifier.
- `behaviour-evaluator.ts` lives at `_shared/behaviour-evaluator.ts` (not inside `ceo-behaviour/`).
- `BriefCopyContext` and `buildBriefCopyContext` do not exist yet — the reference copy pack imports them, so both are created as part of Prompt 3.

---

## Prompt 1 — Data wiring (unblocks 3 dead rules)

In `_shared/brief-signal-coverage.ts`, inside `buildRuleContext`, enrich each `upcomingEvents` entry through the canonical `enrichEvent` / `classifyEvent` resolver and forward:

- `categoryId` — from the classifier
- `attendeeCount` — mapped from the input's `attendeesCount` (field-name mismatch)
- `durationMinutes` — from the event's start/end
- `isInterpersonal` — from the classifier (category D / interpersonal subtype)

Also derive and set `signals.decisionDensityScore` from the same enriched window so the precomputed path in `decisionDensity` stops being dead.

No change to the classifier, the A–H taxonomy, or any rule file.

Tests added to `ceo-behaviour-rules.test.ts`:

1. `contextSwitchingCost` fires on an A + B + C/D sequence inside the 4h window.
2. `interpersonalMeetingContext` fires on `categoryId === 'D'` or `isInterpersonal === true`.
3. `decisionDensity` severity is strictly higher at `attendeeCount >= 6` than at `attendeeCount === 2`, all else equal.

---

## Prompt 2 — Priority ranking + LEAD marker

Add `behaviourPriority(rule: string): number` to `_shared/behaviour-evaluator.ts` using the supplied 0–11 ladder (travel 0 → all others 11), exported so the Plan can adopt the identical ordering.

- `evaluate()` sorts by severity first, then by `behaviourPriority` ascending inside each severity band. Severity always wins.
- `formatPromptBlock` (in `behaviour-wiring.ts`, which owns the block) marks the top-ranked flag `[LEAD]` and every other flag `[CONTEXT]`, and prepends: "The [LEAD] behaviour is the story of this brief. [CONTEXT] behaviours are supporting colour. Do not split attention equally across all of them."
- `deterministic-brief.ts` replaces its ad-hoc `topCeoFlag` sort with the same shared function.
- `BRIEF_PROMPT_VERSION` bumped, mirrored in `src/constants/briefPromptVersion.ts`.

---

## Prompt 3 — Full deterministic copy pack

### Four-beat contract (unchanged; canonical in `BODY_FOUR_BEAT_CONTRACT`)

```text
(a) evidence   — 2 signals from different buckets
(b) read       — the one sharp judgment those signals add up to
(c) directive  — WORK DIRECTIVE: cognitive posture, never a practice name
(d) close      — SELF-REGULATION DIRECTIVE: 3-8 words
```

### Steps

1. **Fix the call-site stripping bug first.** In `compute-outer-readiness/index.ts` (~line 9299) flags are currently reduced to `{ rule, severity }`. Forward the full flag shape — `copyHint`, `stake`, `evidence`, `anchorEvent` included — so all four beats can be populated.
2. **Create `_shared/personas/ceo/behaviour-copy.ts` and `_shared/personas/ceo/thresholds.ts`** from the supplied reference files (neither path exists, so they land as provided).
3. **Add `BriefCopyContext` + `buildBriefCopyContext`.** The type goes in `brief-context.ts`; the builder in `deterministic-brief.ts` maps flag + signals + day shape into the context the pack consumes, including `evidence.categorySequence` populated from the real classifier output (e.g. "product → finance → people").
4. **Wire the four existing builders** to consult `BEHAVIOUR_COPY[flag.rule]?.<beat>(ctx)` for the leading flag and fall through to current generic logic when there is no entry — the same pattern travel already uses. The inline six-case switch in `buildEvidence` is removed once its rules have pack entries.
5. Existing guards stay enforced: zero work language in beats (c)/(d) on non-workdays, and beats (b)/(c) must not restate each other.
6. **Contract test**: `missingCopyEntries(ALL_RULES)` must be empty for every brief-scoped rule, running in CI.

### Copy review points carried through verbatim

`contextSwitchingCost` category sequence from real classifier output; `interpersonalMeetingContext` keeps the specific 15-minute buffer; `decisionDensity` anchors on the highest-weight decision event, not the chronologically first; `postGovernanceOffload` keeps "protect the next 90 minutes"; `vetoRisk` keeps "masked fatigue"; `boardLevelOutcome` keeps the sleep / food / calendar boundaries.

---

## Not touched

The four-beat output contract shape, the LLM system-prompt structure, last week's travel copy, the A–H taxonomy, calendar merge, and the Plan composer.

## Docs

`docs/CEO_BEHAVIOUR_RULE_MAP.md` updated to move the three revived rules out of the stub table, plus the shared-module ownership memory.