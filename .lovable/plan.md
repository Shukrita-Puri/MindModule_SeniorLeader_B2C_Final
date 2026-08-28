# Deterministic Brief — light-day honesty and signal fidelity

## What the data shows (verified for shukrita@mindmodule.me)

This morning's brief for 28 Aug was written by the deterministic path. Its stored inputs say:

- `meetingCount: 1`, `remainingMeetings: 1`, `calendarLoad: "low"`
- one event: "Shukrita Puri | Jane", 13:30–14:00 London, `category: null`
- wearable present but one day old (`wearableSourceAgeDays: 1`), HRV −46%
- no check-in for the window

The copy produced was: "Recovery is significantly under its usual range this morning with **no calendar demand in view** …".

So the pill (LIGHT) and the brief disagree, and the brief is factually wrong.

## The three defects found

**1. Light days fall into the no-calendar sentence.**
The evidence beat only acknowledges the calendar when there are 3+ meetings or load is medium/high. One or two meetings skip every calendar branch and land on the wearable-only sentence that asserts an empty calendar. This is the visible bug.

**2. The event is invisible to the taxonomy.**
Titles in the "Person A | Person B" form (also "Person A / Person B") resolve to no category at all. Confirmed by running the resolver: "1:1 with Jane" resolves to Category D (Executive 1:1) with high confidence, while "Shukrita Puri | Jane" resolves to nothing. Because the event has no category it never becomes high-stakes, so the brief has no event to name and the day looks emptier than it is.

**3. Total vs remaining meetings.**
The evidence beat always uses the whole-day meeting count. In an afternoon or evening brief that can claim meetings that have already finished. The remaining count is already carried in the snapshot and should drive the copy for those windows.

Also noted, lower severity: with a genuinely light calendar, the depleted read line "Physical Recovery is lower than the calendar assumes" points at a calendar that is barely there; and the brief never discloses that the wearable read is from yesterday even though freshness is tracked.

## The fix

**Governing rule: volume is a fact, importance is a judgement.** The number of events on the calendar and the resulting load come straight from the calendar and are stated as they are, always. Classification (A–H) never gates that: it only decides whether an event is worth *naming* and whether it raises the stakes of the day. An unclassified event still counts towards the volume, so the brief can never say the calendar is empty while events exist.

**Describe the day by load, not by a count.** The brief should say the shape of the day in words, using exactly the same classification the calendar signal pill uses (light / moderate / heavy), so pill and brief can never disagree. On the verified case the pill said LIGHT, so the brief should read as a light day rather than an empty one.

If a number is ever used, it must come from the same deduplicated meeting count the pill and demand scorer already produce (cross-provider duplicates collapsed, overlapping meetings in one slot counted as one load unit) via the existing shared helpers, never from a raw row count.

**Zero events on a working day is an open day, not an absence.** When the count is genuinely zero and it is a working day, the copy names it as an open day — unclaimed time to direct — rather than "no calendar demand in view". Weekend and non-workday branches keep their existing wording and are not touched by this rule.




**Recognise two-party meeting titles without needing the words "1:1".** Most invites never say 1:1. Treat a title as an Executive 1:1 (Category D) when it names two people and nothing else contradicts that:

- separator forms: "Shukrita Puri | Jane", "A / B", "A <> B", "A - B"
- conjunction forms: "Rohit and Shukrita", "Rohit & Shukrita"
- connector words that carry no other meaning: "catch-up", "catch up with Jane", "sync with Jane", "chat with Jane", "coffee with Jane" where the counterparty is a person

The title is the evidence. Attendee count is explicitly not used to decide whether something is a 1:1 — people create calendar blocks with no invitees at all, so an empty attendee list proves nothing. Attendee data is used only later, to characterise the relationship (boss, direct report, colleague, external, interview panel), never to grant or deny the 1:1 classification. Duration may be recorded but carries no weight in the decision.

Exclusions — a title stays out of the 1:1 mapping when it reads social or non-work ("chit chat", "drinks", "lunch", "birthday", "dinner", "party", "walk"), when either side is not a person-like name (a team, a product, a company, an all-hands), or when a stronger A–H marker already fires (interview, board, review, offsite). Existing higher-priority classification always wins; this heuristic only fills the gap where the resolver currently returns nothing.


**Window-correct counts.** In afternoon and evening windows the evidence and directive beats use remaining meetings rather than the full-day total; morning keeps the full day.

**Read-line honesty on light days.** When the calendar is light and the band is depleted, use a read that does not lean on calendar assumption.

**Wearable recency.** When the wearable row is a day old, the evidence beat says so in the existing vocabulary rather than presenting it as this morning's read.

## Verification

- Replay this exact snapshot (1 meeting, low load, stale wearable, no check-in) and confirm the body names the meeting instead of denying the calendar.
- Run the 171-fixture golden set plus the validator harness; the new sentences must pass the same gates (three sentences, no dashes, no forbidden vocabulary, signal named).
- Add fixtures for 1 meeting and 2 meetings across all three windows, and for each title form: "A | B", "A / B", "A and B", "catch-up with Jane" (all 1:1) plus the exclusions ("chit chat", "team lunch", "All Hands") which must not map to 1:1.
- Run the deterministic-brief Deno suite and the frontend suite, then redeploy `compute-outer-readiness` and the other taxonomy-consuming functions affected by the resolver change.

## Technical detail

- `supabase/functions/_shared/brief/deterministic-brief.ts`: new light-day branch in the evidence builder before the wearable-only fallback (currently line ~396), phrased with the shared load vocabulary rather than a raw count; zero-guard on the "no calendar demand in view" and "no work calendar" strings; window-gated selection between full-day and remaining load; light-day variant for the `depleted` read entry.
- Load vocabulary and counts sourced from the existing SSOT (`_shared/signal-engine/demand-scorer.ts` load level plus the deduped meeting count already used by the pill and `mergeCalendarEvents`), not recomputed in the brief.

- `supabase/functions/_shared/events/resolve-event-category.ts` and the subtype keyword layer: two-party detection (separators, "and"/"&", connector verbs such as catch-up/sync/chat) → `lead.executive_1on1` (Category D), medium confidence, gated by a person-name test, a social/non-work exclusion list, and existing higher-priority markers; mirrored in `src/lib/events/categories.ts`.
- `compute-outer-readiness/index.ts`: pass `remainingMeetings` into the deterministic options alongside `meetingCount`; pass `wearableSourceAgeDays` for the recency phrasing.
- Tests: `_shared/brief/deterministic-brief.test.ts`, `golden-set.test.ts`, `compute-outer-readiness/worked_examples.test.ts`, `src/lib/events/__tests__/categories.test.ts`.
