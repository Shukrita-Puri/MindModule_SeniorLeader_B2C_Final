# Pattern reminders: real occurrence counts, subtype-level evidence, right time

## Answers first

### (a) Where patterns are stored today, and what I would add

Table: `public.causality_findings`. Key `(user_id, pattern_kind, computed_for_date)`,
`pattern_kind = 'cause_effect_v2'`. Columns: `payload jsonb` (what the Insights
card renders), `signal_summary jsonb` (the flat projection nudges/Plan/Brief
read), plus `event_subcategory text`.

Both stores are already JSON, so **no new column and no new table**. I add new
top-level keys inside `signal_summary`:

```text
subtype_to_rhr: [{ categoryId, subtypeId, label, n, deltaPct, confidence,
                   lastSeen, occurrences: [{ date, title }] }]
subtype_to_hrv: [ same shape ]
```

Existing keys (`event_to_hrv`, `event_to_rhr`, `sleep_to_prs`,
`consecutive_load`, `performance_lift`, `event_to_cognition`) are written exactly
as today, same names, values and format. `payload` is untouched.

### (b) Subtypes per category, and what stays category-level

Subtype counts in `_shared/events/event-subtypes.ts`:
A 11, D 8, C 6, E 7, F 7, B 4, G 4, H 9 — all eight have subtypes.

Treated as **category-level only**: **G Travel** (its four subtypes — flight,
accommodation, travel day, transit — are all the same experience, as you said)
and **H Daily Rhythm & Baseline** (baseline rhythm by definition). A, B, C, D, E
and F are matched at subtype level with no category fallback.

### (c) The engine's look-back window — this needs your decision

`cause-effect-engine/index.ts`: `WINDOW_DAYS = 60`, and a caller may pass
14–90 days maximum. So today the engine sees **60 days**, and quarterly subtypes
(board meetings, conferences) can essentially never reach 3.

I would add a **separate 365-day pass used only for the new subtype keys**. The
existing 60-day calculation stays exactly as it is, so every value Insights reads
is unchanged. This means one extra calendar/wearable read per run, no schema
change. Confirm and I will build it that way.

### (d) Your patterns recalculated at subtype level (365 days, duplicates collapsed)

| Occurrences | Subtype | Reaches 3+ |
|---|---|---|
| 13 | E Deep Work & Strategy / community | yes |
| 7 | D Interpersonal High-Stakes / executive 1:1 | yes |
| 6 | H Daily Rhythm / social | yes (category-level H) |
| 5 | H Daily Rhythm / wellness & self-care | yes (category-level H) |
| 4 | A Board & Governance / board meeting | yes |
| 4 | E Deep Work & Strategy / routine sync | yes |
| 3 | E Deep Work & Strategy / learning | yes |
| 3 | B Influence & Persuasion / fundraising | yes |
| 2 | D / hiring interview | no |
| 2 | G Travel (flight 2 + accommodation 1 + travel 1 = 4 category-level) | yes at category level |
| 2 | H / holiday | — |
| 1 each | E deep work, E product launch, F event, F attendance, C media, A board committee, B client presentation, H recreation | no |

23 further calendar days did not resolve to any category and are counted in no
pattern. Within the current 60-day window only the top three or four rows would
qualify — which is exactly why (c) matters.

Travel at category level has 4 occurrences, so under the new rules a travel
pattern could qualify — but only on a travel day or the evening before, which
22 Sep was not.

### Negative threshold, using the engine's own numbers

Not 1%. The engine's existing meaningful-pattern thresholds:

- percentage measures (resting heart rate, HRV, sleep, readiness):
  `MIN_DELTA_PCT_EMERGING = 10%`, `MIN_DELTA_PCT_STRONG = 15%`
- tier measures (cognition dimensions, 1–5 scale):
  `MIN_TIER_DELTA_EMERGING = 0.5`, `MIN_TIER_DELTA_STRONG = 1.0`

Direction of harm comes from the existing polarity module
`_shared/nudges/metric-polarity.ts`: resting heart rate or heart-rate load above
your baseline is harm; HRV, sleep or recovery below baseline is harm; the opposite
direction is recovery and is never sent as a reminder.

## The rules (one shared check)

`_shared/patterns/pattern-eligibility.ts` — `isPatternCitable(finding, context)`
returns `{ ok, reason }`, used by nudges, Plan and Brief so they cannot disagree:

1. **Enough evidence** — `n >= 3` occurrences. Below 3, never used.
2. **Real count** — once it qualifies, all of its occurrences are used and the
   copy states the true number ("your last 5 board meetings"). Never rounded to 3.
3. **Up to date** — the finding must include your most recent occurrence of that
   event type, checked against the latest resolved past occurrence on your
   deduplicated calendar. No day limit, no cadence table, no staleness ceiling.
4. **Negative** — harm only, at the engine thresholds above.
5. **Right time** — that event type is happening today, or starts tomorrow
   (evening-before framing). Never on an unrelated day.
6. **Right context** — cited only alongside its own event type, matched at
   subtype level for A–F, category level for G Travel and H. No category
   fallback: if the subtype has fewer than 3, nothing is said.

Ties: strongest confidence, then most recent occurrence, then largest effect.
Every rejection reason is logged.

## Copy

Past-tense evidence plus what is ahead, real stored numbers only:

- "Travel tomorrow. Your last 4 travel days raised your resting heart rate by
  27%. Make tonight a recovery evening."
- "Board meeting today. Your last 4 board days dropped your HRV by 20%."
- "3 weeks of travel ahead. Your last 4 travel periods raised resting heart rate
  by 27%."

Inside the existing copy gate — length limits, forbidden words, qualified CTA
verb — and never phrased as a fact about today.

## Files

New: `_shared/patterns/pattern-eligibility.ts` + its test.
Edited: `cause-effect-engine/index.ts` (additive subtype pass and new
`signal_summary` keys only), `smart-nudges/index.ts` (pattern-alert branch and
pattern citation), `generate-mastery-plan/index.ts` (pattern clause in why-lines),
`compute-outer-readiness/index.ts` (pattern clause in the Brief).
Read-only, not modified: the event resolver, travel/trip modules, and everything
Insights fetches or renders.

## Insights: unchanged

No UI change, no change to any field Insights reads, calculates or displays.
`payload` and every existing `signal_summary` key keep the same names, values and
format; the new subtype keys are additive and read only by nudges, Plan and Brief.
Verification test: capture the Insights response for your account before and after
and assert it is byte-identical. Nothing in this plan requires an Insights change
— if that turns out to be false during the build I stop and tell you first.

## Tests

- 2 occurrences rejected; 5 occurrences reported as 5, never as 3.
- A finding missing your latest occurrence rejected.
- A positive pattern not sent; a sub-threshold delta not sent.
- Travel rejected 2 days before travel, accepted the evening before and on the day.
- A board pattern from boards spread over a year accepted before the next board.
- A conference pattern rejected on a day with no conference.
- A media-facing pattern not used before any other Visibility & Comms event, and
  no category fallback when a subtype has fewer than 3.
- Insights response identical before and after.
- Missing dates, event or travel data → skipped quietly, never an error.

## Live verification

Dry run `smart-nudges` for 22 Sep on your account: the travel reminder no longer
qualifies and the log names the rule that stopped it. Then deploy one at a time —
`cause-effect-engine`, `smart-nudges`, `generate-mastery-plan`,
`compute-outer-readiness` — confirming each live before the next.
