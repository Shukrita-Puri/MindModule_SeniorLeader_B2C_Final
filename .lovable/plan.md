# Calendar Load Truth: dedupe, holidays, and window scoping

## What I confirmed on your actual data

Your calendar for Mon 31 Aug holds exactly three rows:

| Title | Provider | All-day | Time |
|---|---|---|---|
| Summer Bank Holiday (regional holiday) | apple | yes | full day |
| Summer Bank Holiday (England, Wales, N Ireland) | apple | yes | full day |
| Meeting with Sara | apple | no | 10:00–10:20 local (already finished) |

The production log for your brief confirms the filter ran:

```text
[db-queries] Filtered non-meeting events: [
  '"Summer Bank Holiday (regional holiday)" (1440min, 0 attendees)',
  '"Summer Bank Holiday (England, Wales, N Ireland)" (1440min, 0 attendees)'
]
```

So the holiday filter works — but only for the *meeting count*. The **load verdict is computed before that filter runs**, on all three events. Three events whose spans overlap produce a hugely negative average gap, which trips the "3 events with tight gaps → high" rule. That is why the card says HEAVY while the same card says "1 meeting done".

This is the exact split you described: one part of the system knows it is a holiday, the other part counts it anyway.

## The four defects

1. **Load verdict ignores the holiday/travel/all-day filter.** The verdict is derived from the unfiltered event list; the meeting count is derived from the filtered one. Both land on the same card.
2. **Load is whole-day, never window-scoped.** Nothing recomputes load against what is still ahead, so at 15:20 with the day's only meeting finished at 10:20 the card still says "heavy this afternoon".
3. **The LLM is fed a third, weaker count.** The prompt's `meetings_remaining` / `meetings_completed` come from a helper that only drops zero-duration rows — no holiday, travel or all-day exclusion. So the LLM and the deterministic path can be looking at different numbers for the same day.
4. **Duplicated thresholds.** The "4+ events" rule is hardcoded in ~8 copy builders instead of importing the shared constant, and the Mastery Plan computes its own load from a raw event count with no filtering at all.

Dedupe itself is working: cross-provider merge runs on both iOS and web, and tomorrow's duplicated Apple/Google training event collapses correctly. The two bank-holiday rows are not duplicates by title, and do not need to be — the holiday filter should remove both before anything counts them.

## The fix

**A. One filtered list feeds everything.** Apply the load-bearing filter (holidays, travel/Category G, all-day Category H, accommodation) *once*, before the demand scorer runs. Load verdict, meeting count, fragmentation and back-to-back hours all derive from that same filtered list. Keep the unfiltered list only for narrative reference (so the brief can still mention a flight) and for the raw event count.

**B. Window-scoped load.** Return a second verdict computed on remaining load-bearing events only. Morning uses the whole-day verdict; afternoon and evening use the remaining verdict. A day with one finished meeting reads "clear from here", not "heavy".

**C. Same count for the LLM.** Point the window-context builders at the filtered list so `meetings_remaining` / `meetings_completed` match what the deterministic path and the pill show. The LLM and deterministic paths then cannot disagree.

**D. Collapse near-identical holiday entries.** Two all-day entries naming the same public holiday resolve to one. This is belt-and-braces once (A) lands, but it keeps the raw event count honest.

**E. De-duplicate the thresholds.** Replace the hardcoded `>= 4` checks with the shared constant, and route the Mastery Plan's load derivation through the same shared helper.

## Verification

- Re-run your brief for today: expect load `low`, `0 meetings ahead / 1 meeting done`, and copy that no longer calls the afternoon heavy.
- Re-run for tomorrow (1 Sep, the training event duplicated across Apple and Google): expect one event, not two.
- Add fixture tests covering: two differently-named holidays, an all-day overlap producing negative gaps, a completed-only afternoon, and a cross-provider duplicate — asserting the LLM-facing count, the deterministic count and the pill verdict are identical in all four.
- Check the same brief on web and iOS to confirm the provider-precedence views agree.

## One thing I want your call on

`primary_calendar_events` does not merge providers — it picks a single winning provider and discards the rest. For you, Apple wins on iOS. Any meeting that exists **only** in your Google calendar is therefore invisible to the brief entirely. That is a separate correctness risk from the one you reported, and fixing it means changing the view to a true cross-provider merge. I have not included it in the fix above. Say the word and I will scope it as a follow-up.

## Technical notes

- `supabase/functions/_shared/signal-engine/db-queries.ts` — move `isLoadBearingEvent` filtering above the `computeCalendarDemand` call; add a `remainingLoad` / `remainingPressure` pair to `CalendarMetricsResult`.
- `supabase/functions/_shared/signal-engine/_event-utils.ts` — `meetingCount()` adopts the load-bearing predicate.
- `supabase/functions/compute-outer-readiness/index.ts` — window selects whole-day vs remaining verdict; replace hardcoded `4` with `LOAD_HIGH_EVENT_COUNT`.
- `supabase/functions/_shared/brief/deterministic-brief.ts` — `calendarLoad` input becomes the window-scoped verdict.
- `supabase/functions/_shared/rules/calendar-merge.ts` (+ `src/utils/rules/calendar-merge.ts` mirror) — same-day public-holiday collapse; the two files stay byte-parallel.
- `supabase/functions/generate-mastery-plan/index.ts` — replace the local raw-count load derivation with the shared helper.
- Redeploy `compute-outer-readiness`, `smart-nudges`, `generate-mastery-plan`.
