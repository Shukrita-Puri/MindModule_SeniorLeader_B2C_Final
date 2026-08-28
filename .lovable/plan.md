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

**Light-day calendar acknowledgement.** Add a light-day branch to the evidence beat so 1–2 meetings are stated rather than erased: name the count and, where the timing is known, the lead event. The no-calendar sentence becomes reachable only when the meeting count is genuinely zero. Weekend and non-workday branches keep their own wording but get the same zero-check.

**Recognise two-party meeting titles without needing the words "1:1".** Most invites never say 1:1. Treat a title as an Executive 1:1 (Category D) when it names two people and nothing else contradicts that:

- separator forms: "Shukrita Puri | Jane", "A / B", "A <> B", "A - B"
- conjunction forms: "Rohit and Shukrita", "Rohit & Shukrita"
- connector words that carry no other meaning: "catch-up", "catch up with Jane", "sync with Jane", "chat with Jane", "coffee with Jane" where the counterparty is a person

Supporting evidence keeps it honest: short duration (≤60 min) and at most two attendees where attendee data exists.

Exclusions — a title stays out of the 1:1 mapping when it reads social or non-work ("chit chat", "drinks", "lunch", "birthday", "dinner", "party", "walk"), when either side is not a person-like name (a team, a product, a company, an all-hands), or when a stronger A–H marker already fires (interview, board, review, offsite). Existing higher-priority classification always wins; this heuristic only fills the gap where the resolver currently returns nothing.


**Window-correct counts.** In afternoon and evening windows the evidence and directive beats use remaining meetings rather than the full-day total; morning keeps the full day.

**Read-line honesty on light days.** When the calendar is light and the band is depleted, use a read that does not lean on calendar assumption.

**Wearable recency.** When the wearable row is a day old, the evidence beat says so in the existing vocabulary rather than presenting it as this morning's read.

## Verification

- Replay this exact snapshot (1 meeting, low load, stale wearable, no check-in) and confirm the body names the meeting instead of denying the calendar.
- Run the 171-fixture golden set plus the validator harness; the new sentences must pass the same gates (three sentences, no dashes, no forbidden vocabulary, signal named).
- Add fixtures for 1 meeting and 2 meetings across all three windows, and for the "A | B" title.
- Run the deterministic-brief Deno suite and the frontend suite, then redeploy `compute-outer-readiness` and the other taxonomy-consuming functions affected by the resolver change.

## Technical detail

- `supabase/functions/_shared/brief/deterministic-brief.ts`: new light-day branch in `nBuildEvidence`/evidence builder before the wearable-only fallback (currently line ~396); zero-guard on the "no calendar demand in view" and "no work calendar" strings; window-gated selection between `meetingCount` and `remainingMeetings`; light-day variant for the `depleted` read entry.
- `supabase/functions/_shared/events/resolve-event-category.ts` and the subtype keyword layer: separator-based two-party 1:1 detection → `lead.executive_1on1` (Category D), medium confidence; mirrored in `src/lib/events/categories.ts`.
- `compute-outer-readiness/index.ts`: pass `remainingMeetings` into the deterministic options alongside `meetingCount`; pass `wearableSourceAgeDays` for the recency phrasing.
- Tests: `_shared/brief/deterministic-brief.test.ts`, `golden-set.test.ts`, `compute-outer-readiness/worked_examples.test.ts`, `src/lib/events/__tests__/categories.test.ts`.
