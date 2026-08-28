# Brief LLM prompt/validator reconciliation — Fixes 1, 2, 3, 5

Scope: prompt-side only. The validator, its thresholds, the window framing gate, and the deterministic path (`deterministic-brief.ts`, `behaviour-copy.ts`) are not modified. Each fix lands as a separate commit.

## Pre-flight finding for Fix 3

`_shared/brief/copy-vocabulary.ts` (prompt constants) and `_shared/copy-vocabulary.ts` (`ELASTIC_LEXICON`, `forbiddenWords`, `detectCluster`, `lexiconFallbackClause`) are different files. The deterministic path imports the second one — `deterministic-brief.ts:14` and `behaviour-copy.ts:43` both import from `../copy-vocabulary.ts`. So unifying the lexicon list touches a constant the deterministic path reads, and the golden set must be re-run after Fix 3, exactly as instructed.

## Fix 1 — Sentence-count contract (commit 1)

In `_shared/brief/copy-vocabulary.ts`, rewrite the `BODY_FOUR_BEAT_CONTRACT` header to:

"THE BODY — exactly 3 short human sentences, one per beat for Evidence, Read, and Directive, with the Self-Regulation Close as a short tail appended to the Directive sentence after a semicolon. Never write a fourth standalone sentence. Never write five sentences."

- Remove "Never merge beats into one long sentence with semicolons."
- Update beat (a) from "1–2 short sentences" to one sentence, beat (c) from "1–2 short sentences" to one sentence, and beat (d) from "A separate sentence" to "a 3–8 word tail after a semicolon on the Directive sentence".
- Word targets (40–55, hard max 60) are unchanged — they already sit inside the validator's window.

## Fix 2 — Rewrite the worked examples (commit 2)

Rewrite all five `WORKED_EXAMPLES` bodies (and the weekend example) so none contains: `baseline`, `high`, `low`, `strong`, `reserves`, `wellness`, `hardware`. Persona, beat order, and register stay identical; each example is also reshaped to the exact-3-sentence form from Fix 1 so the examples demonstrate the contract rather than contradict it.

Replacements use plain observed-state phrasing already accepted by the validator's state-quality and lexicon gates — e.g. "Recovery's above baseline" becomes "Recovery came in ahead of where you usually sit".

Verification before committing: grep every example string against the full forbidden lists used by `validateV61Output` (`WELLNESS_BLACKLIST`, score/readiness blacklists) and by `validateBrief` (`forbiddenWords` in `_shared/copy-vocabulary.ts`), and confirm zero matches. Also confirm each example still satisfies the lexicon-cluster and signal-evidence gates.

## Fix 3 — Unify the lexicon anchor list (commit 3)

1. Identify the exact regex/constant `validateBrief` uses for the lexicon-cluster gate (`_shared/brief-validators.ts`, §5.2 body validator around line 569).
2. Extract its word list into a single exported constant in `_shared/copy-vocabulary.ts` (alongside `ELASTIC_LEXICON`), and have both the validator regex and the prompt's "LEXICON ANCHOR" block build from it, so the prompt lists exactly the words the validator accepts. The validator's matching logic and thresholds are unchanged — only the origin of the word list.
3. Because the deterministic path imports that module, re-run the full 171-fixture golden set immediately after this commit. If it is not 0/171, revert Fix 3, leave the two lists separate, and add a comment documenting the drift risk. The result is reported either way.

## Fix 5 — Investigate `phrase_missing` (report first, no change)

The Gemini call sets `max_tokens: 380` (`compute-outer-readiness/index.ts:8937`). Before changing anything: capture one raw Gemini response that produces `phrase_missing` — by reading the stored raw payload in `brief_snapshots.llm_attempts` if it retains the body, otherwise by replaying the exact prompt for the affected user/window through the gateway with the same parameters — and report which of these is true:

- `phrase` absent from the JSON
- `phrase` present but empty
- `phrase` present but over the character limit
- JSON truncated before `phrase` is reached

No token-ceiling or prompt-structure change is made until that finding is reported.

## Verification after Fixes 1–3

- Full frontend suite (`vitest`), `behaviour-copy.contract.test.ts`, all shared Deno tests, and the 171-fixture golden set. Golden set must stay 0/171.
- Deploy `compute-outer-readiness` only.
- Trigger a live brief build for the affected test user and confirm: `brief_source = 'llm'`, the Brief renders with phrase and body (not the awaiting state), and `brief_snapshots` holds a successful row for that window.
- Report the raw Gemini response and the validator result from that live build.

## Deferred until a live LLM success is confirmed

Tightening the `brief_snapshots` write path to upsert in place per (user, local_date, time_window) instead of inserting a row per attempt. Not started before the live LLM brief succeeds.

## Note

Claude currently has no credits, so attempt 2 is effectively dead and Gemini is the only path that can produce an LLM brief. That does not change any of the work above — it just means the corrective-retry pass will not rescue a Gemini rejection, which raises the importance of Fixes 1 and 2 landing correctly on the first attempt.
