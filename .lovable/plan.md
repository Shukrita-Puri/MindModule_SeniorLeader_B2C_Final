# Change 7 — Pattern-match evidence in the deterministic path

## Verified current state

- `compute-outer-readiness/index.ts:6921` already loads `causalitySignalSummary` from `causality_findings` (Change 1 is live), and it is used for the LLM prompt buckets at lines 7279+.
- `deterministic-brief.ts:416` `buildEvidence()` starts with the travel branch at line 430; `shortRefTimed(opts, title)` and `effectiveWindow(opts)` exist.
- The `buildDeterministicBriefFallback(...)` call site already passes `windowContext` (Change 6 is live), so adding one more opt is a one-line edit.
- `CausalitySignalSummary` is declared inside `compute-outer-readiness/index.ts` only; the shared brief module does not import it today.

## Work

### 1. `deterministic-brief.ts` — optional `causalityData` opt
Add an optional, structurally-typed `causalityData` field (declared locally in the shared file, so no cross-import of the edge function's type) covering `event_to_hrv`, `event_to_rhr`, `event_to_cognition`, `consecutive_load`, `performance_lift.category_lift`. Optional means all 174 golden fixtures and every existing caller compile unchanged.

### 2. `deterministic-brief.ts` — pattern branch inside the evidence-source chain

Two orderings exist and stay separate:

- **Which event is named** — already A–H driven and unchanged: `todayHighStakes` arrives pre-ranked by `getServerCalendarMetrics()` → `rankByStakes()`/`stakesScore()`, the same source the LLM prompt uses. The deterministic path names `todayHighStakes[0]`.
- **Which signal becomes the evidence sentence** — the branch chain in `buildEvidence()`. Change 7 inserts the causality pattern here.

New chain order, as instructed:

```text
travel → causality pattern → CEO flag → drained-into-high-stakes → conference → low sleep → wearable → check-in
```

The causality branch:
- Fires only when `causalityData` is present and `todayHighStakes` is non-empty.
- Skips entries with `n < 3`.
- Case-insensitive match of the first word of `event_type` against a high-stakes title.
- Emits one sentence naming n, event type, direction and absolute delta, framed as "the morning after" (never "during"), with window-aware tense: "still ahead" in the afternoon, "today" otherwise, using `shortRefTimed()` for the event reference.
- No match, or no data: the chain runs as before.

One consequence to flag: conference currently sits second (immediately after travel). Moving it below CEO flag and drained is a behaviour change for conference days even when no causality data exists, so conference-day golden fixtures may re-baseline. If any conference fixture changes, I will report the diff before accepting it rather than silently re-baselining.


### 3. `compute-outer-readiness/index.ts` — pass the data
Add `causalityData: causalitySignalSummary` to the single existing call site. No new query, no schema change.

### 4. Tests
The scope list names `_shared/brief/behaviour-copy.contract.test.ts`, which does not exist — the contract test lives at `_shared/personas/ceo/behaviour-copy.contract.test.ts` and its copy pack is frozen. To avoid touching the frozen persona area, the three fixtures (causality match / no calendar match / null causality) go in a new file `_shared/brief/deterministic-causality.test.ts` in the same Deno test style as the existing `deterministic-generic-window.test.ts`. Say the word if you'd rather they sit in the persona contract file instead.

## Verification
- `deno test supabase/functions/_shared/brief` and `_shared/personas` green.
- Golden set still 174 fixtures, no re-baselining (existing paths untouched).
- Assertions: evidence names n and event type; never contains "during"; no `<event> ahead`; null causality still produces a brief.
- Deploy `compute-outer-readiness` only. No prompt-version bump.

## Scope
Files touched: `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`, plus one new test file. Everything else (MRS, Plan, Insights, Nudges, cause-effect-engine, validators, signal-engine, event taxonomy, frontend, migrations) stays frozen.
