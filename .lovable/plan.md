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

Apply the `[A]` suffix to all three day blocks.

**Today** (CALENDAR TODAY, lines 6798-6804)
- Derive `todayHighStakesCategories: string[]` alongside the existing `todayHighStakesEventTimes` by mapping each title through `classifyEvent` (empty string when unclassified).
- Render each paired entry as `HH:mm Title [A]`, or `Title [A]` when no time is known.

**Tomorrow** (=== TOMORROW ===, lines 6848-6855)
- Same derivation over `tomorrowHighStakesTitles`; render `HH:mm, Title [B]`.

**Yesterday** (new block)
- Today the prompt only carries the boolean `yesterday_had_high_stakes` (line 7535). Add a small `=== YESTERDAY ===` block that lists yesterday's high-stakes titles with local time and category, sourced the same way as today: query `primary_calendar_events` for yesterday's local-day window, run it through `mergeCalendarEvents` + the existing high-stakes filter, then `classifyEvent` for the category. The existing boolean stays as-is so nothing downstream changes.
- The block is emitted only when yesterday actually had high-stakes events (keeps token cost flat on quiet days).

**Importance guide** — appended once, after the CLOCK TIME RULE line: built from `EVENT_CATEGORIES` with the canonical names and the ordering `A > B > C > D > E > F > G > H`, plus "Focus beat (c) on the highest-category event."

## Change 2 — Plan "Why this matters": `_shared/plan/why-llm.ts`

The THE EVENT block already prints `Category: A — High-Stakes Governance` (line 582), so no data wiring is needed. Only addition: one importance-ordering line in the same block, so the LLM knows where the event sits in the hierarchy on a multi-event day.

## Wiring: server → payload → frontend

- Server: the three category arrays are derived once and reused for both the prompt and the response payload — no second classification path.
- Payload: `compute-outer-readiness` gains `highStakesEventsDetailed: { title, localHHmm, category, categoryName, day: 'yesterday' | 'today' | 'tomorrow' }[]`, derived from the same arrays. Existing `highStakesEvents: string[]` stays for backward compatibility.
- Frontend: `src/hooks/useOuterReadiness.ts` gets the matching type and a safe parser (defaults to `[]`, so an older cached payload cannot crash the card). Today `highStakesEvents` is typed in the hook but not rendered anywhere, so this is the wiring point the UI reads from.
- UI: the Brief card's high-stakes context line renders the category name next to the event (e.g. "Board Review — High-Stakes Governance"), using existing tokens/typography. No new card, no layout change. If you'd rather the category stay invisible in the UI and only inform the prose, say so and I'll drop this bullet.

## Verification

- `tsgo` typecheck + the existing vitest suites (no validator or vocabulary changes, so no expected diffs).
- New unit coverage: category suffix present for classified titles, absent for unclassified ones, across yesterday/today/tomorrow.
- Live `curl` of `compute-outer-readiness` to confirm the payload carries `highStakesEventsDetailed`.
- Deploy `compute-outer-readiness` and `generate-mastery-plan` (the latter bundles `_shared/plan/why-llm.ts`), all in this pass.
- Report exact lines changed per file.