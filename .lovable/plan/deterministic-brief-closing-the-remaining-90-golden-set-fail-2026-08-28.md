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

## Three confirmations before any copy is written

**1. Em dash — confirmed forbidden anywhere in the body. Semicolons will be used.**
`compute-outer-readiness/index.ts` defines `DASH_BREAK = /(?:\s[—–]\s|[A-Za-z]\s*[—–]\s*[A-Za-z])/` and `validateV61Output` returns `body_em_dash` whenever it matches. That pattern is position-independent: any em or en dash surrounded by spaces, or sitting between two letters, rejects the whole body — not only sentence-initial or terminal uses. Only numeric ranges like `0–2` escape it. So every Read and Directive collapse uses a **semicolon** (or a comma/colon where it reads better). No new em dashes will be introduced, and existing bank strings that already carry an em dash between words will be converted to semicolons in the same pass.

**2. Beat (c) Directive only — beat (d) Self-Regulation Close is untouched. Confirmed.**
The work-context/verb rewrite applies exclusively to the Directive beat. Recovery-only imperative closes ("protect sleep tonight", "skip the drinks tonight", "give yourself a quiet evening") are correct by design and will **not** gain a work-facing verb or a work object. The validator only requires `WORK_DIRECTIVE_TOKENS` + `WORK_CONTEXT_TOKENS` to appear somewhere in the body, which the Directive beat satisfies; the close stays as the short 2–12 word tail after the final connector.

**3. No-wearable coverage preserved. Confirmed.**
The harness fix will not blanket-populate wearable signals. Each window keeps at least one explicit no-wearable fixture (`hasWearable: false`, `hasCurrentWearable: false`, `wearableFact: null`, and a signals object with `hrvDeviationPct` / `sleepHours` / `rhrDeviationPct` all null) so the wearable-absent copy path and the `body references wearable evidence when no wearable signal exists` gate both stay under test. The wearable-present vs wearable-absent fixture counts per window will be reported after the change.

## What to change

### 1. Collapse Read banks to one sentence (52 failures)
`NARRATIVE_READS` in `supabase/functions/_shared/personas/ceo/behaviour-copy.ts` still holds two-sentence reads, e.g. `"The sessions are not the load. The people between them are."` and `"Few rooms, large consequence. Today is about depth, not throughput."`. Apply the same `nOneSentence` collapse already used for Evidence, joining with a **semicolon**: `"The sessions are not the load; the people between them are."` One clause, one verb per beat.

### 2. Collapse Directive banks to one instruction (part of the 52, plus grammar)
Directive strings that embed a second sentence, e.g. `"... comes first — the board call. Everything after it can be listening"`, get folded into a single semicolon-joined or comma-joined clause: `"... comes first, the board call; everything after it can be listening"`. One verb, one instruction per beat, no dashes.

### 3. Directive beat (c) rewrites for the four at-risk families (20 failures)

Root cause confirmed by reading the token lists: `WORK_CONTEXT_TOKENS` contains `room`, `decision`, `block`, `agenda`, `afternoon`, `morning`, `work`, `priority` — but **not** "session". Every conference directive names sessions and corridors only, so it reads as contextless to the validator. The fix is a work-object swap in a pacing register, not an activation.

Proposed beat (c) copy, for review before the diagnostic runs:

- **conferenceDepletion** — `Pace the afternoon block at half attention and skip the corridor rounds; the debrief keeps until tomorrow.`
- **conferenceDayAttend** — `Keep your output to the two rooms that actually matter and skip the rest of the agenda; presence is the only thing being read today.`
- **back_to_back / evening** — `Name tomorrow's first block and close the one decision still open, then stop.`
- **weight_heavy / evening** — `Write down where the heavy room landed and close that decision tonight; the rest of the work keeps until morning.`

Each names a work object, leads with a `WORK_DIRECTIVE_TOKENS` verb (`pace`, `keep`/`skip`, `close`), is one sentence, uses a semicolon rather than a dash, and instructs on reduction, sequencing or closure — never on doing more. Beat (d) is untouched.

**`volume_heavy` evening — explicit handling.** `nEveningDirective` currently shares one `case` between `back_to_back` and `volume_heavy`, and the existing shared string carries an em dash (`"...then stop — nothing left today decides anything"`) with no `WORK_CONTEXT_TOKENS` word, so it fails today. After the split, `volume_heavy` does **not** fall through to the `back_to_back` string. It gets its own entry:

- **volume_heavy / evening** — `Pick tomorrow's first two priorities and close the calendar; the rest of the volume waits.`

Same register as the other three: names a work object (`priorities`, `calendar`), leads with a `WORK_DIRECTIVE_TOKENS` verb (`pick`, `close`), one sentence, semicolon not a dash, and it reduces rather than activates. Its five bands are checked individually in the post-fix diagnostic: `volume_heavy` evening either passes in the 0/171 run or is named explicitly in the remaining-failure report. It is never left silently inheriting `back_to_back` copy.

### 4. Fix the golden-set validator context (13 + 5 failures)
In `golden-set.test.ts` and `diagnose_golden.ts`, derive the `signals` object from the fixture inputs rather than hardcoding a near-empty one: when the fixture sets `hasCurrentWearable` supply realistic `sleepHours` / `hrvDeviationPct` / `rhrDeviationPct`; when it sets `hasCurrentCheckIn` supply `emotionalSelfDeclared`, `mentalSharpness`, `confidence`; when either flag is false, leave those fields null. This mirrors the production call shape in `compute-outer-readiness`.

Per confirmation 3, add one explicit no-wearable fixture per window (morning, afternoon, evening) with `hasWearable: false`, `hasCurrentWearable: false`, `wearableFact: null` and all three wearable signal fields null. These fixtures keep a check-in and a calendar, so they must still produce a valid four-beat brief from demand and shape signals — not an awaiting state, not an error. The wearable-present vs wearable-absent count per window is reported after the change.

### 5. Re-run and lock
Re-run the diagnostic to confirm 0/171 failures, then run the Deno contract test (`behaviour-copy.contract.test.ts`) and the golden-set test so CI blocks regressions. No re-deploy is required for the test files; `deterministic-brief.ts` / `behaviour-copy.ts` changes ship with the next `compute-outer-readiness` deploy.

## Files touched

- `supabase/functions/_shared/personas/ceo/behaviour-copy.ts` — Read and Directive bank collapse, work-context directive rewrite
- `supabase/functions/_shared/brief/deterministic-brief.ts` — only if a generic close needs the same single-sentence treatment
- `supabase/functions/compute-outer-readiness/golden-set.test.ts` — signal-complete validator context
- `diagnose_golden.ts` — mirror the same context

Validator source (`_shared/brief-validators.ts`) is not changed — the contract stays as-is and the copy is made to satisfy it.
