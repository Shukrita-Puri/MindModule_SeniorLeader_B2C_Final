# Isolated Change 2 — Event category (A–H) in the Brief prompt

Scope: prompt text only, in two places. No scoring, selection, validator, UI or DB changes.

## Canonical source of the categories

The A–H taxonomy already exists at `supabase/functions/_shared/events/event-categories.ts` (`EVENT_CATEGORIES`), with the classifier at `_shared/events/event-classifier.ts` (`classifyEvent`). `compute-outer-readiness/index.ts` already imports `classifyEvent` (line 24), so no new data pipeline or extra query is needed — categories are derived from the same titles already in `todayHighStakes`.

Important correction: the labels in the request do not match the canonical taxonomy. The real names are:

```text
A = High-Stakes Governance      E = Deep Work & Strategy
B = Influence & Persuasion      F = Conferences & External Events
C = Visibility & Communication  G = Travel
D = People & Difficult Convos   H = Daily Rhythm & Baseline
```

The prompt will use these canonical names (read from `EVENT_CATEGORIES`, not hardcoded) so Brief, Plan, Nudges and Insights stay on one vocabulary.

## Change 1 — Brief: `compute-outer-readiness/index.ts`

CALENDAR TODAY section, lines 6798-6804:

- Derive `todayHighStakesCategories: string[]` alongside the existing `todayHighStakesEventTimes` by mapping each title through `classifyEvent` (empty string when unclassified).
- Append `[A]`-style suffixes to each paired entry, exactly as specified: `HH:mm Title [A]`, or `Title [A]` when no time is known.
- After the CLOCK TIME RULE line, append one importance-guide line built from `EVENT_CATEGORIES` with canonical names and the ordering `A > B > C > D > E > F > G > H`, plus: "Focus beat (c) on the highest-category event."

The same suffix treatment is not applied to the TOMORROW block in this pass (request scoped to CALENDAR TODAY); say the word if you want it there too.

## Change 2 — Plan "Why this matters": `_shared/plan/why-llm.ts`

The THE EVENT block already prints `Category: A — High-Stakes Governance` (line 582), so no data wiring is needed. Only addition: one importance-ordering line in the same block, so the LLM knows where the event sits in the hierarchy on a multi-event day.

## Verification

- `tsgo` typecheck.
- Existing brief/plan test suites run unchanged (no validator or vocabulary changes, so no expected diffs).
- Deploy `compute-outer-readiness` and `generate-mastery-plan` (the latter bundles `_shared/plan/why-llm.ts`).
- Report exact lines changed.