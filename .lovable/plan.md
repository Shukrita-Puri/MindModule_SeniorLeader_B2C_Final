# Change 7 — Pattern evidence in the deterministic Brief (+ two LLM-path fixes)

Launch-safe sequencing: step 1 ships and verifies on its own before any structural work begins.

## The governing rule

**A–H decides which event the Brief is about. Evidence decides how specifically that event can be spoken about. Evidence never reorders events.**

## What "causality evidence" means

One sentence citing this person's own measured history for the event already selected. Several shapes qualify, and the timeframe is fixed per family — never mixed in one sentence:

| Pattern data | Timeframe | Sentence |
|---|---|---|
| `performance_lift.hr_event_lift` | **during** | "Your heart rate runs 14 bpm above resting during these." |
| `event_to_rhr` | **morning after** | "The morning after, your resting rate sits 11% higher." |
| `event_to_hrv` | **morning after** | "Recovery the morning after has run about 20% below your usual." |
| `event_to_cognition` | same/next day | "Clarity has dropped roughly a tier after these, across four of them." |
| `consecutive_load` | trailing | "After two heavy days your recovery has run 11% lower." |
| `sleep_to_prs` | next day | "On short-sleep nights your next day has come in about 14% lower." |
| `performance_lift.category_lift` | positive | "Deep-work days are where your numbers have come in strongest." |

## Step 1 (first, standalone) — marker mismatch

Verified: `compute-outer-readiness/index.ts` emits `← TODAY` at lines 7333, 7340, 7354, 7369, 7388 (HR block plus its instruction line, RHR, HRV, cognition), while `SILENT_REASONING` tells the model to prioritise `⚑ TODAY'S CALENDAR`. The model has been told to act on a marker it never sees.

Fix: replace all five occurrences with `⚑ TODAY'S CALENDAR`. Prompt strings only — no logic, no new files, no test changes. `copy-vocabulary.ts` stays exactly as written; no `BRIEF_PROMPT_VERSION` bump.

Verify: `grep "← TODAY" compute-outer-readiness/index.ts` returns zero results. Then deploy `compute-outer-readiness` and confirm before continuing.

## Step 2 — `hr_event_lift` matching gap

`hr_event_lift` matches only `f.bucket` against `todayEventTypes`; RHR/HRV/cognition use the wider `matchesTodayEventType()` (category name, subtype id, label, bucket, substring pass). Route `hr_event_lift` through the same helper so in-event HR — the strongest event-level evidence — stops being the narrowest matcher. LLM path only.

## Step 3 — deterministic path: subject → evidence

```text
A-H EVENT PRIORITISATION            (UNTOUCHED — getServerCalendarMetrics ->
                                     rankByStakes/stakesScore -> todayHighStakes)
Subject:
  travel shape (G) and conference shape (F) remain shape overrides at the top;
  otherwise the subject is todayHighStakes[0] in all cases (then [1] only if a
  subject yields no usable sentence at all);
  no event -> day shape / pillar state.
      |
Evidence for the ALREADY-SELECTED subject:
  Tier 1  pattern store   in-event HR -> next-morning RHR -> next-morning HRV
                          -> cognition -> consecutive load -> positive lift
  Tier 2  supporting      CEO behaviour flag, drained-into-this-event,
                          low sleep into this event, travel/conference framing
  Tier 3  fallback        generic wearable fact, then check-in outcome
  Tier 4  none            name the subject itself (existing A-H phrasing)
```

Subject selection is genuinely untouched: the restructure only reorganises which sentence explains the chosen subject.

Work:
1. `_shared/brief/deterministic-brief.ts` — optional, locally declared `causalityData` opt covering all six families. Optional, so every existing caller and all 174 fixtures compile unchanged.
2. `_shared/brief/deterministic-brief.ts` — restructure `buildEvidence()` into subject → tier ladder and add tier 1. Behaviour-preserving with `causalityData` null.
3. `compute-outer-readiness/index.ts` — pass `causalityData: causalitySignalSummary` at the single existing call site. No new query, no schema change.

Tier-1 gating matches the LLM prompt exactly: `n >= 3` plus HR ≥ 8 bpm, RHR > 10%, HRV ≥ 15%, cognition ≤ −0.4 tiers, load/sleep ≥ 8%. Matching uses the same A–H label set as the prompt. Event references use `shortRefTimed()`, never raw `todayHighStakes[0]`, so timing phrasing stays consistent with every other branch. Window-aware tense: "still ahead" in the afternoon, "today" otherwise.

## Step 4 — tests

New file `_shared/brief/deterministic-causality.test.ts` (the persona pack stays frozen):
- one fixture per pattern family, asserting the correct timeframe wording — `hr_event_lift` says "during", `event_to_rhr`/`event_to_hrv` say "the morning after", and no sentence contains both;
- pattern present but no calendar match → falls through silently, unmatched type never named;
- `causalityData: null` → output identical to today;
- **subject-stability regression** (the important one): for a travel day, a conference day and a plain high-stakes day, adding pattern data does not change which event is named.

## Verification and stop conditions
- `deno test supabase/functions/_shared/brief` and `_shared/personas` green.
- Golden set stays at 174 with no re-baselining. **If any fixture's named event changes, that is a regression — stop and report, never re-baseline.**
- `grep "← TODAY"` zero after step 1.
- Deploy `compute-outer-readiness` only, after step 1 and again after step 3. No `BRIEF_PROMPT_VERSION` bump.

## Scope
Touched: `compute-outer-readiness/index.ts`, `_shared/brief/deterministic-brief.ts`, one new test file. Frozen: `copy-vocabulary.ts`, CEO persona pack, MRS, Plan, Insights, Nudges, cause-effect-engine, executive cards, frontend, migrations, signal pills, validators, signal-engine, event taxonomy.
