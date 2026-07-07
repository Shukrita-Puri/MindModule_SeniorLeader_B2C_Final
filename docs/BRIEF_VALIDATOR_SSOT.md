# Executive Home Brief Validator — SSOT

> Ownership + duplication note for the Decision Readiness Brief validator.
> Read this before touching any validator regex, lexicon list, or acceptance
> rule for the Brief LLM output.

## Where the live validator actually lives

The **production** validator for Executive Home Brief generation is the
inline function:

```
supabase/functions/compute-outer-readiness/index.ts
  → function validateV61Output(parsed, phraseText, bodyTextStr, opts)
```

It is a closure over request-scoped state (`todayHighStakes`,
`materialTravelContextActive`, `materialWorkEventTitles`, `calendarLoad`,
`bandValence`, …). Every Brief attempt for the three daily windows
(morning / afternoon / evening) is gated by this function. If it returns
`{ valid: false }` the caller either retries once (soft reject) or falls
through to the deterministic brief (hard reject) per the Atomic Brief
Contract.

**Do not** assume `supabase/functions/_shared/brief-validators.ts` is the
production gate. It is a parallel, non-authoritative implementation kept
for future consolidation — see the "Consolidation note" below.

## What the live validator enforces today

### Loosened (safe-loosening pass)
| Rule | Behaviour |
| --- | --- |
| `body_no_signal_evidence` | Passes on number, named event, calendar-empty baseline lexicon, legacy data-vocab, **or approved state-quality word** (`recovery, sleep, rested, fatigued, sharp, foggy, drained, steady, compressed, elevated, shifted, heavy, light, loaded`). |
| Phrase length | 2–4 words accepted · 5 words soft reject (retry once) · 6+ words hard reject. |
| `leanOn` / `watchFor` source | `ARCHETYPE` \| `COACH` \| `PATTERN` \| **`GOALS`**. |
| Elastic Lexicon cluster | Cognition · Physiology · Resilience · **Executive-Context** (`conference, summit, board, pitch, negotiation, travel, landing, back-to-back, compressed, decisions, density, re-entry, offsite, speaking, presentation, high-stakes, governance`) · baseline lexicon (calendar-empty only). |
| Body word ceiling | Target 45–55, hard max 60 (aligned with `BODY_FOUR_BEAT_CONTRACT` in `_shared/brief/copy-vocabulary.ts`). |

### Still strict — do not loosen without a separate ticket
| Rule | Rejection reason |
| --- | --- |
| Em-dash in phrase or body | `phrase_em_dash` / `body_em_dash` — em-dashes are banned to keep prose plain-typography and copy-safe across surfaces. |
| Abstract system phrases in body | `body_abstract_system_phrase` — blocks "come down clean", "hold the base", "mask the surge", "optimise the window", "leverage your physiological runway". |
| Travel-context omission | `body_omits_material_travel_context` — when `materialTravelContextActive`, body must include a `MATERIAL_TRAVEL_BODY_RX` marker. |
| Material work-context omission | `body_omits_material_work_context` — when material travel is active AND today has named work events, body must reference ≥1 significant token from those event titles. |
| Band-gate valence | `body_prescribes_score_improvement` · `body_valence_mismatch_low_push` · `body_valence_mismatch_high_protect` — deterministic tone check against MRS band. |
| Four-beat structural fingerprint | A cleaner structural implementation exists in `_shared/brief-validators.ts` (`validateBodyFourBeatStructure`), but that module is **not** the authoritative production gate. The live inline validator in `compute-outer-readiness/index.ts` approximates the same fingerprint via body-length, one-line-read, and repeated-4gram gates. |
| One-line score-read echoes | `body_restates_one_line_read` — body cannot restate any of the 5 canonical MRS one-line reads. |
| Numeric score / tier restatement | `body_restates_score_xx_100` · `body_restates_score_phrase` · `body_restates_tier_label`. |
| Metric-list bodies | `body_metric_list_N` — ≥2 metric qualifiers in close proximity. |

## Prompt ↔ validator alignment

- Body length guidance is a single string owned by `BODY_FOUR_BEAT_CONTRACT`
  in `supabase/functions/_shared/brief/copy-vocabulary.ts`: **target 45–55
  words, absolute max 60**. The inline validator's hard cap (`wordCount > 60`)
  and the user-facing repair message ("your body exceeded 60 words") both
  match.
- `leanOn` / `watchFor` prompt (`SOURCE ∈ {ARCHETYPE, COACH, PATTERN, GOALS}`)
  matches the inline `ALLOWED_SOURCES` gate.
- No stale "40 words max" copy remains in either the prompt module or the
  inline validator as of this SSOT.
- The `OUTPUT_CONTRACT` no longer claims a strict `1-3 words` rule for
  `leanOn` / `watchFor` signals; the live validator only enforces signal
  presence, a 10-word upper bound, 60-character width, and source/vocabulary
  validity.

## Prompt-only vs hard-gated inventory

Rules below are grouped by where they are actually enforced. The prompt
surfaces all of them via `VALIDATOR_ALIGNED_GUARDRAILS` in
`_shared/brief/copy-vocabulary.ts`, but only the **Hard-gated live** column
causes a rejection in `validateV61Output` today.

### Already hard-gated live (rejection reasons from `validateV61Output`)

| Rule | Rejection reason | Notes |
| --- | --- | --- |
| Phrase length 2–4 words | `phrase_hard_reject_*` / `phrase_soft_reject_*` | 5 words soft-retry, 6+ hard reject. |
| Phrase forbidden openers | `phrase_forbidden_opener` | Blocks `you` / `your` / `the` at phrase start. |
| Phrase coaching imperatives | `phrase_coaching_imperative` | Blocks `you should`, `you need to`, `try to`, `consider`, etc. |
| Em dash / en dash in phrase or body | `phrase_em_dash` / `body_em_dash` | Plain typography only. |
| Body metric list | `body_metric_list_N` | ≥2 metric qualifiers in close proximity. |
| Body restates phrase | `body_restates_phrase` | Verbatim echo of the phrase in the body. |
| Generic-trait / COACH restriction | `leanOn_generic_trait` / `watchFor_generic_trait` | Traits like `Self-Awareness`, `Discernment`, `Alignment` allowed only when `source = COACH`. |
| `leanOn` / `watchFor` source whitelist | `leanOn_invalid_source_*` / `watchFor_invalid_source_*` | Only `ARCHETYPE`, `COACH`, `PATTERN`, `GOALS`. |
| Body signal evidence / state-quality fallback | `body_no_signal_evidence` | Requires number + unit, named event, calendar-empty baseline lexicon, or approved state-quality word. |
| Executive-context lexicon cluster | `body_no_signal_evidence` (lexicon branch) | Body must include cognition, physiology, resilience, or executive-context lexicon. |
| Abstract system phrases in body | `body_abstract_system_phrase` | Blocks "come down clean", "hold the base", "mask the surge", "optimise the window", "leverage your physiological runway". |

### Still mostly prompt-only (not a hard gate in `validateV61Output` today)

| Guidance | Why it is prompt-only | Risk if ignored |
| --- | --- | --- |
| No numbers in phrase | Not regex-gated in phrase validator; only discouraged in prompt. | May produce less human-sounding headlines. |
| Explicit directional-move requirement | Four-beat directive verbs live in `BODY_FOUR_BEAT_CONTRACT` and are mirrored in `_shared/brief-validators.ts`, but the production `validateV61Output` does not re-check directive verbs directly. | Body may feel advisory rather than oriented. |
| Preferred sentence shape (1–3 short sentences, four-beat structure) | Structural rules are enforced in the parallel `_shared/brief-validators.ts` implementation, but not in the live inline validator. | Body may exceed word budget or lose the Chief-of-Staff cadence. |
| Ideal `leanOn` / `watchFor` word target | Live validator only caps at 10 words / 60 chars and checks vocabulary/source; no tight 1–3 word gate. | Signals may become verbose or raw-signal-like. |

If any of the prompt-only guidance above needs to be promoted to a hard gate,
that requires a separate validator ticket and must be implemented in
`validateV61Output` (and mirrored in tests) rather than in the prompt module.

## Tests

- `supabase/functions/compute-outer-readiness/validator_loosening.test.ts`
  is the executable spec for the safe-loosening rules. It mirrors the
  regex constants and branch logic exactly. If a constant changes in
  `index.ts`, update the mirror in the test file in the same commit.
- `supabase/functions/compute-outer-readiness/body_copy.test.ts` exercises
  §2.19.5 body assessment contract via live HTTP calls.

## Consolidation note (future work — do NOT do in a loosening pass)

There are currently **two** implementations of overlapping validation logic:

1. **Inline `validateV61Output`** in `compute-outer-readiness/index.ts` — the
   authoritative production gate.
2. **`_shared/brief-validators.ts`** (`validatePhrase`, `validateBody`,
   `validateBodyFourBeatStructure`, `validateBrief`) — a cleaner pure-function
   version, currently **not wired** into the live Brief path.

### Risks of the duplication
- Rule drift: a change made in one file may not land in the other.
  Recent loosening was applied only to the inline path; `_shared/brief-validators.ts`
  still reflects the pre-loosening phrase-length rule and the pre-loosening
  source whitelist. This is intentional for this pass, but must be resolved
  before `_shared/brief-validators.ts` is promoted.
- Ambiguous ownership in future audits.

### Recommended consolidation sequence (separate PR)
1. Port the inline validator body-by-body into `_shared/brief-validators.ts`,
   preserving every rejection reason string verbatim (they are consumed by
   telemetry and the user-facing repair-cause mapper around
   `index.ts:~4880`).
2. Expose the request-scoped state (`todayHighStakes`, travel/work context
   flags, `calendarLoad`, `bandValence`) as an explicit `BriefValidatorCtx`
   argument.
3. Replace the inline function with a call to the shared module behind a
   feature flag (`SHARED_MODULES_ENABLED`, per
   `mem/features/performance-readiness/prompt-snapshot-brief.md`).
4. Run the flag OFF for one deploy, ON for the next, and monitor
   `body_no_signal_evidence` / `phrase_hard_reject_*` / `leanOn_invalid_source_*`
   rates against baseline.
5. Delete the inline validator only after two clean windows on the flag ON.

Until that sequence completes, **the inline validator in
`compute-outer-readiness/index.ts` is the single source of truth.**
