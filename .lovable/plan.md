# Post-audit closure — deterministic Brief quality + doc/version hygiene

Two pre-launch code fixes (both in the generic, non-narrative branch of the deterministic brief), then documentation/version bumps that can land after launch. No gating, scoring, schema, MRS/Plan/Insights changes.

## A. Pre-launch (launch-blocking, small and additive)

### A1. Kill `"{event} ahead"` in the generic branch
`_shared/brief/deterministic-brief.ts` (~line 355) still builds `"...with {ref} ahead this {window}..."`. The narrative pack removed this construction; the generic branch never got it. Replace with the natural construction already used in `NARRATIVE_COPY` (e.g. "the flight is the demand this morning").

### A2. Window-gate the sleep-driven directives in the generic branch
The generic branch selects `lowSleepIntoHighStakes` (and siblings) straight from `opts.sleepScore` with no window guard, so an afternoon/evening brief can be driven by an overnight signal. Apply the same rule the narrative path already enforces: sleep and overnight recovery are quotable in `morning` only; afternoon/evening fall back to felt state (check-in) plus day shape. Where no eligible body signal exists, drop the beat rather than invent one.

Also tense-correct the un-gated forward-looking line at ~:447 ("open working day ahead") so afternoon/evening read "what is left of the day" / "the day ran". The weekend line at :677 is fine as-is.

### A3. Extend the contract tests to the generic branch
`behaviour-copy.contract.test.ts` only exercises `NARRATIVE_COPY`. Add the same three invariants against `buildDeterministicBriefFallback` with `leadNarrative: null` across the three windows:
- no `"<event> ahead"`,
- no sleep/overnight language outside morning,
- timing clause emitted at most once.

Deliberately not fixed pre-launch: the `variantSeed` fallback (`${window}|${family}`). Production always passes a full seed, so it is latent. Tighten after launch.

## B. Version bumps — what should and should not move

- **`BRIEF_PROMPT_VERSION` should NOT be bumped for A1/A2.** The constant governs the LLM prompt contract and cache invalidation; these are deterministic-fallback copy fixes. Bumping would invalidate every cached brief on launch day for no benefit. If you want the corrected copy to displace already-cached deterministic rows, the manual-refresh force path already covers it.
- Code-level doc bumps that should happen (documentation only):

| Doc | Action |
|---|---|
| `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` | bump v6.3 → v7.7; correct `prompt_version`, input_signature and the fallback contract |
| `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md` | correct model ladder (Gemini Flash → Claude Haiku), 3-sentence contract, cache key (`input_signature` + `prompt_version`); remove the false "canonical SSOT" claim and point to `compute-outer-readiness/index.ts` |
| `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md` | append v7.7 calendar-load honesty, `two-party-title.ts`, remaining-meetings copy, manual-refresh behaviour |
| `docs/EXECUTIVE_HOME_CARDS_REGENERATED_SSOT.md` + wiring guide + drift report | v6.5/v6.6 → v7.7; note the deterministic fallback is reinstated |
| `docs/EVENT_TAXONOMY_A_H_SSOT.md` | create (Phase 5 deliverable, never written) |

## C. Memories to add (prevents future re-breaking)

- Calendar-load honesty: load vocabulary is factual (light/busy/heavy), "open day" reserved for true-zero working days; A–H classification never changes the count.
- Two-party title inference: title-driven only; attendee count and duration are not evidence of a 1:1.
- Deterministic-fallback contract: fallback must pass `validateBrief()` or the Brief goes to awaiting; window rules apply to the generic branch as well as `NARRATIVE_COPY`.

## Verification

- `deno test supabase/functions/_shared/brief supabase/functions/_shared/personas` green.
- Golden set (174 fixtures) green, plus the new generic-branch invariants.
- Frontend vitest suite unchanged.
- Deploy `compute-outer-readiness` only; no other function consumes the changed copy.
