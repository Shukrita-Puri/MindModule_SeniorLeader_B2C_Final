# Brief LLM failure audit — report only (no code written)

## Headline

The LLM brief path is not intermittently failing. It has a **100% failure rate across all users since 2026-08-08**. The last brief with `brief_source = 'llm'` was written on **2026-08-08 14:42 UTC**. Every brief since then is either `deterministic` (48 in the last 7 days) or `awaiting` (304 in the last 7 days).

Neither provider is timing out or being blocked by billing in any meaningful volume. **Almost every attempt reaches the model, returns parseable JSON, and is then rejected by the validators.** The prompt and the validator now contradict each other.

## Point 1 — Failure mode per attempt

The ladder is **two** attempts, not three: attempt 1 `google/gemini-2.5-flash` (gateway, 15s), attempt 2 `claude-haiku-4-5-20251001` (direct, 10s). The third Claude pass was removed on 2026-08-07.

Attempt outcomes across the last 7 days (from `brief_snapshots.llm_attempts`):

| Outcome | Count |
|---|---|
| `validator_reject` (inline `validateV61Output`) | ~500 |
| `atomic_validator_reject` (`_shared/brief-validators.ts`) | ~120 |
| `timeout` | 9 |
| billing / auth / parse failures | 0 observed |

Typical attempt durations are 1.8–2.4s, i.e. well inside budget.

For the affected user (`google-oauth2|111878424918915566691`, 2026-08-28 evening) the recorded reasons are, per row:

- `attempt1_validation_body_restates_phrase` / `attempt2_validation_body_evening_framing_in_morning`
- `attempt1_validation_leanOn_generic_trait` / `attempt2_validation_leanOn_generic_trait`
- `attempt1_validation_leanOn_missing_or_empty` / `attempt2_validation_body_no_lexicon_cluster`
- `attempt1_validation_body_pattern_irrelevant` / `attempt2_atomic_body contains forbidden word "low"`
- `attempt1_validation_body_evening_framing_in_morning` / `attempt2_validation_phrase_missing`

Answer to the four sub-questions: the calls **reached the model and failed validation**. Not timeouts, not auth/billing, not parse failures.

## Point 2 — What the validators reject

Top rejection rules, last 7 days, both models combined:

1. `body_no_signal_evidence` — 176
2. `phrase_missing` — 151
3. `body_no_lexicon_cluster` — 81
4. `body has 4 sentences (four-beat contract expects 1–3)` — 40
5. forbidden words in body: `baseline` 35, `high` 16, `low` 11, `reserves` 14, `strong` 8
6. `body_wellness_or_hardware_word` — 36
7. `leanOn_generic_trait` — 34
8. `body_evening_framing_in_morning` — 8

Against the specific checks in the prompt request:

- **Em dashes** — the body validator does not currently ban em dashes outright (`—` is even accepted as a closing connector), so this is *not* a live cause of rejection. The concern is real for the deterministic copy rules, not for the LLM gate.
- **Sentence count** — real and material: `validateBrief` rejects any body with more than 3 sentences (40 hits).
- **Work-directive token** — folded into `body_no_lexicon_cluster` / `body_no_signal_evidence`; 257 combined hits, the largest bucket.
- **Over 60 words** — not appearing in the failure data.

## Point 3 — Is the Gemini → Claude fallthrough working?

Yes. Every failure row records two attempt objects, one per model, and attempt 2 receives a targeted `CORRECTIVE RETRY` instruction built from attempt 1's rejection rule. There is a deliberate short-circuit that skips attempt 2 when attempt 1 returns a workspace credit-ceiling status; it has not fired in the observed window. No missing catch branch, no early return.

## Point 4 — Prompt vs validator consistency

This is the root cause. `_shared/brief/copy-vocabulary.ts` still instructs the model in ways the current validators reject:

- `BODY_FOUR_BEAT_CONTRACT` opens with **"THE BODY — 3–5 short human sentences"** and adds **"Never merge beats into one long sentence with semicolons."** `validateBrief` rejects anything above **3 sentences**. The prompt is asking for output the gate refuses.
- Four of the five `WORKED_EXAMPLES` use the word **"baseline"** ("Recovery's above baseline…"), which the atomic body forbidden-word list rejects. The model copies the examples faithfully and is punished for it.
- Worked examples also lean on `high` / `low` / `strong` — all banned.
- The prompt's lexicon anchor list and the validator's lexicon cluster regex are separately maintained, which is why `body_no_lexicon_cluster` fires so often.
- `phrase_missing` (151) suggests the model is regularly returning JSON without a usable `phrase` field under the 380 max-token ceiling — worth confirming against a raw capture, currently unconfirmed.

## Point 4b — A likely window bug found in passing

The time-of-day framing gate derives its own window as `hour < 12 ? morning : hour < 18 ? afternoon : evening`. The app's canonical windows treat **18:00–04:59 as evening**. So between midnight and 05:00 local, the gate believes the window is *morning* while the row is written as *evening* — which is exactly why `body_evening_framing_in_morning` appears on evening rows written at 00:53 local. This gate contradicts the standardized time-window SSOT.

## Point 5 — Blast radius

- **All 23 users with brief rows in the last 30 days are affected.** No user has had an LLM brief since 2026-08-08.
- Last 7 days: **304 awaiting** vs **48 deterministic** rows.
- **16 distinct (user, date, window) buckets** have more than one row in the last 7 days. The affected user alone has **12 rows** for 2026-08-28 evening — every brief request inserts a new row rather than updating in place, which is the duplication the earlier upsert concern was about.

## Summary answers

- **Failure mode per attempt:** validator rejection after a successful, fast model response — both attempts, every time.
- **Billing / timeout / parse / validation:** validation, overwhelmingly (9 timeouts in 7 days, no billing or parse failures).
- **Is the prompt producing output that fails the current validator:** yes — the prompt's sentence-count instruction and its own worked examples directly violate the atomic validator.
- **Is the fallthrough working:** yes.
- **Users affected:** all of them, for 20 days.

## Recommended fix order (for review, not yet implemented)

1. Reconcile `BODY_FOUR_BEAT_CONTRACT` sentence count with `validateBrief` — pick one number and make both sides use it.
2. Rewrite `WORKED_EXAMPLES` so no example contains a forbidden word (`baseline`, `high`, `low`, `strong`, `reserves`).
3. Derive the prompt's lexicon anchor list from the same constant the validator regex uses, so the two cannot drift.
4. Fix the framing gate to use the canonical evening window (18:00–04:59) instead of its local `hour < 12` split.
5. Investigate `phrase_missing` against a raw model response capture before changing anything there.
6. Only then tighten the `brief_snapshots` write path to update in place per (user, date, window).
