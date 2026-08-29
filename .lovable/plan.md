# Change 7 — Pattern evidence in the deterministic Brief (and an LLM parity fix)

## The governing rule

**A–H decides which event the Brief is about. Evidence decides how specifically that event can be spoken about. Evidence never reorders events.**

Today's `buildEvidence()` conflates the two: travel and conference are *subjects*, while CEO flag, drained, low sleep, wearable and check-in are *evidence types*, all in one flat chain — so an evidence type can change which event the user sees. Change 7 splits it into two stages and plugs the pattern store into the evidence stage.

## What "causality sentence" means

It is just: *one sentence that cites this person's own measured history for the event that is already selected*. Not one shape — the pattern store holds several, and all of them qualify:

| Pattern data | Sentence it produces |
|---|---|
| `performance_lift.hr_event_lift` (in-event peak HR) | "Across three board meetings your heart rate ran 14 bpm above resting." |
| `event_to_rhr` (next-morning RHR) | "The three mornings after a board meeting your resting rate sat 11% high." |
| `event_to_hrv` (next-morning HRV) | "Recovery the morning after these has run about 20% below your usual." |
| `event_to_cognition` | "Clarity has dropped roughly a tier after these, across four of them." |
| `consecutive_load` | "After two heavy days your recovery has run 11% lower." |
| `sleep_to_prs` | "On short-sleep nights your next day has come in about 14% lower." |
| `performance_lift.category_lift` (positive) | "Deep-work days are where your numbers have come in strongest." |

Two distinct time frames, never mixed: **during** the event (HR only — it is the intraday signal) and **the morning after** (RHR, HRV — recovery cost). The earlier card said "never during", which was wrong; the correct rule is *during* belongs to HR, *morning after* belongs to RHR/HRV.

## LLM-path audit (verified in code)

- Prompt bucket order is Bucket 1 physiology → Bucket 2 calendar & day shape → Bucket 3 patterns & history, so the LLM does get the day's events before the patterns.
- `compute-outer-readiness/index.ts:7279+` already matches every Bucket 3 family against today's A–H-resolved events (`enrichOf()` bucket / category / subtype / label, with a substring pass) and tags matches, and it tells the model to name a matched pattern in beat (c). So the LLM path already implements subject-then-evidence.
- **One real defect:** the prompt writes the marker as `← TODAY`, but the `PATTERN PRIORITY RULE` and the six-level selection order in `copy-vocabulary.ts:257,295` tell the model to look for `⚑ TODAY'S CALENDAR`. The model is instructed to prioritise a marker that never appears. Change 7 aligns the two on the `⚑ TODAY'S CALENDAR` spelling (prompt side only; the vocabulary file stays as written, so no prompt-version bump is needed for the rules themselves).
- Coverage gap: `hr_event_lift` matches only on `bucket`, while the other families use the wider label matcher. Point `hr_event_lift` at the same `matchesTodayEventType()` helper so in-event HR — the strongest event-level evidence — stops being the narrowest matcher.

## Deterministic path — the two stages

```text
TODAY'S EVENTS
      |
A-H EVENT PRIORITISATION       (unchanged: getServerCalendarMetrics ->
      |                         rankByStakes/stakesScore -> todayHighStakes)
Ranked subjects:
  1. Travel shape (G)
  2. Conference shape (F)
  3. todayHighStakes[0], then [1]
  4. No event -> day shape / pillar state
      |
For the SELECTED subject, take the strongest evidence available:
  Tier 1  pattern store   in-event HR -> next-morning RHR -> next-morning HRV
                          -> cognition -> consecutive load -> positive lift
  Tier 2  supporting      CEO behaviour flag, drained-into-this-event,
                          low sleep into this event, travel/conference framing
  Tier 3  fallback        generic wearable fact, then check-in outcome
  Tier 4  none            name the subject itself (existing A-H phrasing)
```

Selection moves to the next-ranked subject only when a subject yields no usable sentence at all. Tier 1 ordering is by evidence strength for the *already chosen* subject, so richer pattern data makes a Brief more specific — never a different Brief.

Tier 1 gating: `n >= 3`, plus the same magnitude floors the LLM prompt already uses (HR ≥ 8 bpm, RHR > 10%, HRV ≥ 15%, cognition ≤ −0.4 tiers, load/sleep ≥ 8%), so the two paths cite a pattern under identical conditions. Matching uses the same A–H label set as the prompt, not a first-word compare. Window-aware tense: "still ahead" in the afternoon, "today" otherwise, event reference via `shortRefTimed()`.

## Work

1. **`_shared/brief/deterministic-brief.ts`** — add an optional, locally declared `causalityData` opt covering all six families (`event_to_hrv`, `event_to_rhr`, `event_to_cognition`, `sleep_to_prs`, `consecutive_load`, `performance_lift.{hr_event_lift,category_lift}`). Optional, so every existing caller and all 174 fixtures compile unchanged.
2. **`_shared/brief/deterministic-brief.ts`** — restructure `buildEvidence()` into subject → tier ladder, and add the tier-1 pattern branch. Behaviour-preserving with `causalityData` null: every subject falls straight to its existing branch and emits today's sentence.
3. **`compute-outer-readiness/index.ts`** — pass `causalityData: causalitySignalSummary` at the single call site (no new query), fix the `← TODAY` / `⚑ TODAY'S CALENDAR` marker mismatch, and route `hr_event_lift` through `matchesTodayEventType()`.
4. **Tests** — the scope list names `_shared/brief/behaviour-copy.contract.test.ts`, which does not exist; the contract test lives in the frozen `_shared/personas/ceo/` pack. New fixtures go in `_shared/brief/deterministic-causality.test.ts`: one per pattern family (correct during-vs-morning-after framing); pattern present but no calendar match → falls through silently; `causalityData: null` → output identical to today; subject-stability regression proving added pattern data never changes which event is named.

## Verification
- `deno test supabase/functions/_shared/brief` and `_shared/personas` green.
- Golden set stays at 174 with no re-baselining. Any fixture diff means the restructure was not behaviour-preserving — I report it rather than accept it.
- Marker-parity assertion: the string the prompt emits equals the string the rules tell the model to look for.
- Deploy `compute-outer-readiness` only. No `BRIEF_PROMPT_VERSION` bump.

## Scope
Touched: `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`, one new test file. Frozen: MRS, Plan, Insights, Nudges, cause-effect-engine, executive cards, frontend, migrations, signal pills, validators, signal-engine, event taxonomy, CEO copy pack.
