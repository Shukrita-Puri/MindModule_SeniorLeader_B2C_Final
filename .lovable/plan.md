# Brief travel awareness + iOS calendar load count

Two isolated fixes, deployed and rollback-able separately.

## What the code read confirms

**LLM path (already correct):** `copy-vocabulary.ts` already exports `PERSONAL_TRAVEL_DIRECTIVE`, `workTravelDirective(phase)`, `CONFERENCE_DIRECTIVE`, `NON_WORKDAY_DIRECTIVE`, `WEEKEND_DIRECTIVE`, routed by `dayShapeDirective()` inside `buildBriefSystemPrompt()`. `compute-outer-readiness` builds the prompt twice — line 6485 without day shape, then line 7804 with `dayShape` + `travelPhase` — and the LLM calls (8790/8799/8848/8860) all use the rebuilt `systemPromptWithLeader`. Bucket 3 (patterns/causality) is present and already reads `causality_findings.signal_summary`.

**Deterministic path (the gap):** `deterministic-brief.ts` has no notion of travel or conference. `DeterministicBriefFallbackOpts` carries only `isWeekend` / `isNonWorkday`, and `buildDeterministicBriefFallback` collapses `isNonWorkday` into `isWeekend`. So a Sunday `work_travel` day (flight, then work) produces a workday pillar directive, and personal travel/conference produce weekend copy. The call site (line ~9255) passes `isWeekend` and `isNonWorkday` but not `briefDayShape` / `briefTravelPhase`, both of which are in scope.

**Calendar count — now root-caused** (DB read of 9 Aug for this account). Nine rows land in the day window, all from `apple_calendar`:

```text
all-day  Stay: DoubleTree by Hilton New York Downtown    (hotel, 8 days)
all-day  Stay at DoubleTree by Hilton New York Downtown  (same hotel, Gmail-created copy)
all-day  National Day                                    (Singapore public holiday)
07:00    Weigh day
08:00    Sailing
18:25    Flight: BA 183 from LHR to JFK
18:25    Flight to JFK (BA 183)
18:25    Flight to New York (BA 183)
all-day  National Day observed
```

Two independent defects, neither of them provider precedence:

1. **The three flights share identical start/end times but carry three different titles.** The merge identity key is `normalisedTitle | 5-min start bucket | 10-min duration bucket`, so title drift alone blocks the collapse. All three also come from the same provider, so passing `'ios'` instead of `'unknown'` changes nothing here (the two precedence lists are identical anyway). The two hotel-stay rows have the same problem.
2. **The load count has no category filter.** `getServerCalendarMetrics` counts anything clearing `isNoiseTitle` plus the attendee/duration floor. A public holiday, an 8-day hotel stay, a weigh-in and a sailing session all count as "meetings". The Brief and Plan already classify these correctly (the flights carry `eventType: logistic`, category G), but the calendar signal pill never consults that classification. So the read is right: this is not primarily a dedupe bug — the pill is counting a holiday and a hotel booking as meeting load.

## Fix 1 — Travel / conference / day-shape reaches the deterministic brief

Files: `_shared/brief/deterministic-brief.ts`, `compute-outer-readiness/index.ts`.

1. Extend `DeterministicBriefFallbackOpts` with optional `dayShape`, `travelPhase`, `longHaulFlight`, `conferenceDayNumber`, `conferenceTitle`. All optional — existing callers and tests unaffected.
2. Stop collapsing `isNonWorkday` into `isWeekend` when a `dayShape` is supplied; route `buildDirective()` by day shape first (work_travel by phase, personal_travel, conference, holiday/PTO, weekend), falling through to the current pillar branches for `workday`. Existing weekend and workday strings stay byte-identical.
3. Add matching day-shape closes in `closeFor()` (travel/conference/off-day), weekend and workday closes unchanged.
4. Pass `dayShape: briefDayShape`, `travelPhase: briefTravelPhase`, plus long-haul and conference fields from `briefBehaviourSnapshot.signals` at the existing call site. No other field changes.
5. Add two worked examples (work travel pre-departure, conference day 2) to `WORKED_EXAMPLES` so the LLM register matches.
6. **Impact, not just awareness:** beat (b)/(c) copy on travel and conference days states the cost of the shape (transit load, accumulated attention) and, where a Bucket 3 pattern exists for the matching event bucket, the LLM is instructed to cite it ("the last flights left the mind mixed the following morning"); when no pattern exists, it names the generic cognitive cost instead. The deterministic strings use the generic form only — the deterministic path has no pattern access.
7. **Travel-aware evidence and read (beats a and b).** `buildRead()` has no day-shape awareness today and emitted a workday pillar read on the flight day; it gets a travel/conference block ahead of the existing pillar logic, with everything from `hasHighStakes` onward byte-identical. `buildEvidence()` gets a travel branch that names the flight — the flight never appears in `todayHighStakes` (category G is excluded from that list), so a new optional `travelEventTitle` (from `signals.nextTravelEventTitle`) is passed in and used.
8. **Flight titles stop being truncated.** `shortRef()` gains a travel branch (keyword match plus the `XX 183` flight-number pattern) returning "the flight", replacing the 22-character truncation that produced "the flight to new york (ba....".
9. **Why a Sunday flight read as a weekend:** `buildDeterministicBriefFallback` sets `isWeekend = rawOpts.isWeekend || rawOpts.isNonWorkday`, and a Sunday flight is a genuine calendar weekend, so the weekend branch won every time and `work_travel` could never be distinguished. Day-shape routing running before that check is the fix.
10. No `BRIEF_PROMPT_VERSION` bump for the deterministic-only changes.

## Fix 2 — Calendar load pill counts the wrong things

Files: `_shared/signal-engine/db-queries.ts`, `_shared/rules/calendar-merge.ts`, plus the `mergeCalendarEvents` platform argument.

1. **Use the existing event classification for the load count.** Exclusion rule, exactly: exclude **category G** (all logistic/travel, flights included); exclude **all-day category H** (personal rhythm — hotel stays, weigh day); exclude **public holidays**. Everything else still counts. The flight is not dropped from the system — it continues to reach the Brief through day shape and the Next Up pill; it is removed only from the meeting count. This is confirmed against the classifier output before Step 4 deploys.
2. **Collapse near-duplicate titles at the same time.** The clustering anchor is the **flight number**, not start/duration overlap alone: same start and duration **plus** a shared flight-number token (`BA 183`), or one normalised title fully contained in the other (the two DoubleTree rows). Positive unit test uses these exact strings — `"Flight: BA 183 from LHR to JFK"`, `"Flight to JFK (BA 183)"`, `"Flight to New York (BA 183)"` — and asserts they collapse to one. Negative test uses two genuinely different 18:25 events with no shared flight number and asserts they do **not** collapse. Second positive case: `"Stay: DoubleTree by Hilton New York Downtown"` and `"Stay at DoubleTree by Hilton New York Downtown"`. Scoped to `calendar-merge.ts`; shared file, so it lands alone with its tests.
3. **Apply the load-unit rule.** Overlapping distinct meetings in one slot count as one load unit via `countLoadUnits`, per `mem://architecture/event-load-and-dedupe-rules`. List surfaces keep showing every distinct meeting.
4. **Pass the real platform.** Replace the hard-coded `'unknown'` with the already-computed `platform` at every `mergeCalendarEvents` call site in `compute-outer-readiness` and `db-queries.ts`. Correctness hygiene; no behaviour change on its own.

Expected result for 9 Aug: the pill reads light with no meeting load — a holiday, a hotel stay, two personal blocks and one flight — instead of "HEAVY · 3 meetings ahead".

## Not touched
Scoring, MRS, pill tier computation, gating, freshness, `phraseFor()`, `deriveDayShape`, `buildBehaviourSnapshot`, `mergeCalendarEvents`'s provider-precedence logic, any UI component, any other edge function, DB schema, API response shape. No LLM prompt changes: the snapshot cache filters on `prompt_version = 'v7.0-brief-copy-buckets'` so no pre-v7.0 brief can be served, `_legacyInlineSystemPrompt` is a dead variable, all four LLM call sites use the rebuilt `systemPromptWithLeader`, and Anthropic `cacheSystemPrompt` is server-side token caching only. `buildEvidence()` / `buildRead()` are edited only to add the travel branch described in Fix 1.

## Deploy order
Steps 1 and 2 share `_shared`, so they ship as one deploy. Steps 3 and 4 are **not** bundled — a clustering regression must be isolable from a count regression.

1. `deterministic-brief.ts` (interface, `shortRef`, `buildDirective`, `buildRead`, `buildEvidence`, `closeFor`) + the two worked examples in `copy-vocabulary.ts` → typecheck + full test run.
2. `compute-outer-readiness` call-site wiring (day shape, travel phase, long-haul, conference day, travel title) → deployed together with Step 1 → smoke test work_travel/pre, work_travel/post, personal_travel, conference day 2, pto, and weekend-strained plus workday green+amber as regression guards.
3. `calendar-merge.ts` near-duplicate clustering, alone, with its tests. Confirm the three exact BA 183 strings before the identity key changes.
4. `db-queries.ts` category-aware meeting count + load units + real platform, alone → confirm the G / all-day-H / public-holiday exclusion against classifier output → deploy → verify the 9 Aug pill and the `[db-queries] Filtered non-meeting events` log.
