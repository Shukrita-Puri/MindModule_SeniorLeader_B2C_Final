# Why-line validator: resolve the "calm" / "productive" contradiction

## What the failure actually is

The Plan engine writes a one-line "why" for each practice slot. Before that line is shown, `validateWhyLine` checks it. Four of its 27 tests fail — and they fail because two rules inside the app now contradict each other, not because of a stale test.

1. The validator's **state vocabulary** treats `calm` as a legitimate "steady" word — proof the line is grounded in the user's actual state.
2. The shared **forbidden-word list** (the wellness-trope ban used by Notifications and the Brief) lists `calm` as banned copy.

The forbidden-word check runs first, so any why-line containing `calm` is rejected as `forbidden_word_calm` before the state check ever sees it. The word can never do the job the state vocabulary assigns to it.

Failing cases:

| Test | Expected | Actual |
|---|---|---|
| generic-rejection test | `generic` | `forbidden_word_productive` |
| steady synonym "calm" accepted | accept | `forbidden_word_calm` |
| dedupe threshold (0.85) still holds | accept, then dedupe | `forbidden_word_calm` |
| 35-word boundary accepted | accept | `forbidden_word_calm` |

Only the first is a genuine fixture problem: its sample text uses the banned word "productive", so it is rejected for a stricter, earlier reason than the test names. The other three are the real contradiction — they exercise unrelated behaviour (state synonyms, dedupe, word ceiling) but happen to use `calm` as filler.

## Impact today

No user-facing breakage. Rejected why-lines fall back to the deterministic repair path in `generate-mastery-plan`, so a valid line is always shown. The cost is silent: `calm` lines are quietly discarded, the dedupe and word-ceiling rules are effectively untested, and a permanently red suite masks future regressions in those paths.

## Recommendation

Treat the forbidden-word list as authoritative. Brand rules already ban wellness tropes in user copy, and the Brief guidance explicitly says to use "settle" / "steady" instead of "calm". The state vocabulary is the side that is wrong.

### Changes

1. `supabase/functions/_shared/plan/why-llm.ts` — remove `calm` from the `steady` state-token regex. `steady`, `holding`, `on track`, `even`, `settled`, `on pace`, `in rhythm` remain, so grounding coverage is unaffected.
2. `supabase/functions/_shared/plan/why-llm-validator.test.ts` — in the three tests that use `calm` only as filler, swap it for `settled` so each test measures what it names (synonym acceptance, dedupe, word ceiling).
3. Same test file — replace `productive` in the generic-rejection sample with neutral, non-banned wording so the assertion genuinely exercises the `generic` grounding rejection rather than the earlier forbidden-word gate.
4. Add one new test asserting `calm` is rejected as `forbidden_word_calm`, locking the resolved precedence in place so the contradiction cannot silently return.

### Explicitly not doing

- Not weakening or forking the forbidden-word list for the Plan engine. One vocabulary across Brief, Nudges, and Plan is the point.
- Not reordering the validator gates. Forbidden-word first is correct — banned copy should never reach grounding.

## Verification

- Run the shared plan Deno suite: expect 27/27 in `why-llm-validator.test.ts` and a fully green suite.
- Run `tsgo --noEmit`.
- No migration needed. Redeploy `generate-mastery-plan` so the tightened vocabulary takes effect in production.