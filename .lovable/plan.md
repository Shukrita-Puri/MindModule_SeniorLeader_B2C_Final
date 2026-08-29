# Change 7 — Pattern-match evidence in the deterministic path

Your model is right, and it is cleaner than the card. Restating it as the governing rule:

**A–H determines event priority. Evidence determines how strongly and specifically the selected event can be represented. Evidence never reorders events.**

The current `buildEvidence()` chain does conflate the two: travel and conference are *subjects* (which context is surfaced), while CEO flag, drained, low sleep, wearable and check-in are *evidence types* (how that subject is explained). They sit in one flat list today, so an evidence type can change which subject the user sees. Change 7 restructures it into two stages instead of inserting causality into the flat list.

## Verified current state

- `compute-outer-readiness/index.ts:6921` already loads `causalitySignalSummary` from `causality_findings` (Change 1 is live).
- `_shared/brief/deterministic-brief.ts:416` `buildEvidence()` is the flat chain; `shortRefTimed()` and `effectiveWindow()` exist.
- The `buildDeterministicBriefFallback(...)` call site already passes `windowContext` (Change 6 is live).
- `todayHighStakes` arrives pre-ranked by `getServerCalendarMetrics()` → `rankByStakes()`/`stakesScore()` — the same A–H priority source the LLM prompt uses. Change 7 does not touch it.

## The two stages

```text
TODAY'S EVENTS
      |
A-H EVENT PRIORITISATION            (unchanged, existing code)
      |
Ranked subjects:
  1. Travel shape (G)
  2. Conference shape (F)
  3. Highest-ranked high-stakes event, then the next one
  4. No event -> day shape / pillar state
      |
For the selected subject, pick the strongest available evidence:
  causality pattern  ->  supporting  ->  fallback
```

Evidence tiers, per subject:
1. **Causality pattern** — a `causality_findings` entry with `n >= 3` whose event type matches this subject.
2. **Supporting** — the existing subject-specific evidence for that subject: travel/conference wearable framing, CEO behaviour flag, drained-into-this-event, low sleep into this event.
3. **Fallback** — the generic wearable fact, then the check-in outcome.
4. **None** — name the subject itself, using the existing A–H phrasing.

Only when a subject yields no usable sentence at all does selection move to the next-ranked subject. Adding causality can therefore make a subject *more* specific, never swap it for a different one.

## Work

### 1. `deterministic-brief.ts` — optional `causalityData` opt
Add an optional, structurally typed field (declared locally, no cross-import of the edge function's type) covering `event_to_hrv`, `event_to_rhr`, `event_to_cognition`, `consecutive_load`, `performance_lift.category_lift`. Optional means every existing caller and all 174 golden fixtures compile unchanged.

### 2. `deterministic-brief.ts` — restructure `buildEvidence()` into subject → evidence
Refactor the existing branches into an explicit subject list in the A–H order above, each resolved through the tier ladder. The refactor is behaviour-preserving where no causality data exists: with `causalityData` null, every subject falls straight to its existing supporting/fallback branch and emits the same sentence as today. The only new output path is tier 1.

Causality sentence: names n, event type, direction and absolute delta, framed as "the morning after" (never "during"), window-aware tense ("still ahead" in the afternoon, "today" otherwise), event reference via `shortRefTimed()`. Match is case-insensitive on the first word of `event_type` against the subject's title.

### 3. `compute-outer-readiness/index.ts` — pass the data
Add `causalityData: causalitySignalSummary` to the single existing call site. No new query, no schema change.

### 4. Tests
The scope list names `_shared/brief/behaviour-copy.contract.test.ts`, which does not exist — the contract test lives at `_shared/personas/ceo/behaviour-copy.contract.test.ts` and that persona pack is frozen. The new fixtures therefore go in a new `_shared/brief/deterministic-causality.test.ts`, matching the style of `deterministic-generic-window.test.ts`:
- causality match on a Cat-A event, morning: names n and event type, never says "during", no `<event> ahead`.
- causality data present but no calendar match: falls through, never names the unmatched type.
- `causalityData: null`: brief still generates, output byte-identical to today.
- Subject-stability regression: for a travel day and a conference day, adding causality data does not change which subject is named.

## Verification
- `deno test supabase/functions/_shared/brief` and `_shared/personas` green.
- Golden set still 174 fixtures with no re-baselining — the restructure is behaviour-preserving without causality data. Any fixture diff is a bug in the refactor, not a new baseline; I will report it rather than accept it.
- Deploy `compute-outer-readiness` only. No prompt-version bump.

## Scope
Files touched: `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`, plus one new test file. MRS, Plan, Insights, Nudges, cause-effect-engine, executive cards, frontend, migrations, signal pills, validators, signal-engine, event taxonomy and the CEO copy pack stay frozen.
