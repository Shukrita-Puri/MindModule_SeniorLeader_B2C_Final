# Pattern reminders: enough evidence, right time, right context

## What went wrong (verified on your live account)

The 09:30 reminder on 22 Sep was `pattern_alert` (`FB-PATTERN::B`). The stored
finding behind it (`causality_findings`, 21 Sep):

```text
event_to_rhr: [{ event_type: "Travel", rhrDeltaPct: 27.3, n: 2, lastSeen: "2026-08-17", confidence: "emerging" }]
```

Two travel days, both from August, sent on a day with no travel. It also fired on
16 Sep (+26%) and 23 Aug (+23%). Three gaps: `extractTopPattern` in
`smart-nudges/index.ts` applies no occurrence floor at all (the other pattern
branch requires 3), nothing checks whether the event type is actually happening,
and the copy is present tense.

## Answers to your three questions

### (a) Files I will change

New, additive:
- `supabase/functions/_shared/patterns/pattern-eligibility.ts` — the one shared
  check (all five rules) plus the sentence builder.
- `supabase/functions/_shared/patterns/pattern-eligibility.test.ts` — your test list.

Edited, narrowly:
- `supabase/functions/smart-nudges/index.ts` — the pattern-alert branch and the
  pattern-citation helper call the shared check instead of their own logic.
- `supabase/functions/generate-mastery-plan/index.ts` — the why-line clause that
  cites a pattern calls the shared check.
- `supabase/functions/compute-outer-readiness/index.ts` — the Brief's pattern
  clause calls the shared check.

Read only, not modified: `_shared/events/resolve-event-category.ts`,
`_shared/travel/travel-day.ts` and the trip-window module, `cause-effect-engine`
(keeps writing exactly what it writes today), and everything Insights reads.

### (b) How "negative" is decided per measure

Direction is judged against your own baseline using the existing polarity module
`_shared/nudges/metric-polarity.ts`, which already encodes:

- resting heart rate above baseline → harm; below → recovery, not harm
- HRV lower → harm; higher → recovery
- sleep worse → harm; better → recovery
- heart-rate load higher → harm

Only "harm" qualifies for a reminder. A deviation under 1% counts as neutral and
is not sent. Positive and neutral patterns are silent.

### (c) How I check the pattern includes your latest occurrence

Each finding carries `lastSeen` (the last date of that event type in the window
the engine analysed). I resolve, through the existing resolver, the most recent
past occurrence of the same event type on your deduplicated calendar. The pattern
qualifies only when the finding's `lastSeen` is on or after that date — i.e. the
engine has already seen your most recent one. If it is older, your latest
occurrence is not in the evidence and the pattern is skipped. If either date is
missing, the pattern is skipped quietly. No day limit anywhere.

## The shared check

`isPatternCitable(finding, todayContext)` returns `{ ok, reason }` and applies, in
order:

1. `n >= 3` occurrences.
2. Includes your latest occurrence of that event type (per (c) above).
3. Negative direction (per (b) above).
4. That event type occurs today, or starts tomorrow — travel read from the travel
   SSOT and trip windows, every other type from today's/tomorrow's resolved
   calendar events.
5. Cited only next to its own event type — the slot/brief/nudge anchor must
   resolve to the same A–H type and subtype.

When several qualify: strongest confidence, then most recent `lastSeen`, then
largest absolute effect. Applies to all A–H types and subtypes, travel included.
Every reason is written to the evaluator log, so a suppression is explainable.

## How the message reads

Past-tense evidence plus what is ahead, real stored numbers only:

- "Travel tomorrow. Your last 3 travel days raised your resting heart rate by
  27%. Make tonight a recovery evening."
- "Board meeting today. Your last 3 board days dropped your HRV by 20%."
- "3 weeks of travel ahead. Your last 3 travel periods raised resting heart rate
  by 27%."

Generated inside the existing copy gate — length limits, forbidden words,
qualified CTA verb — and never phrased as a fact about today.

## What does not change

- Insights and its cards are untouched, including 2-occurrence "emerging"
  findings; `cause-effect-engine` keeps storing exactly what it stores today. The
  new rules apply only where a pattern is used in nudges, Plan or Brief.
- No database change, no frontend change.
- All other reminder rules unchanged: send windows, quiet hours, daily cap, 2h
  spacing, silent-sync exclusion, week-ahead, light-day, JIT.
- Plan day shapes, arcs, the readiness gate and every other why-line evidence
  source are unchanged; only the pattern clause is gated.
- Every new read is failure-tolerant: missing dates, event or travel data means
  the pattern is skipped, never an error.

## Tests

- 2 occurrences rejected.
- A finding that misses your latest occurrence rejected.
- A positive pattern not sent.
- Travel rejected 2 days before travel; accepted the evening before and on the day.
- 3 boards spread over a year accepted before the next board.
- Conference pattern rejected on a day with no conference.
- Insights read path asserted unchanged.
- Full backend suite green.

## Live verification

Dry run `smart-nudges` on your account for 22 Sep: confirm the travel reminder no
longer qualifies and the logged reason names which rule stopped it. Then deploy
one function at a time — `smart-nudges`, then `generate-mastery-plan`, then
`compute-outer-readiness` — confirming each live before the next.
