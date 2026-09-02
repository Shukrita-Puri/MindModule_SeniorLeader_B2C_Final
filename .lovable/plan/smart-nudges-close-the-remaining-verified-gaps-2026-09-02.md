# Smart Nudges — close the remaining verified gaps

## What the re-verification found

I re-read the live files at HEAD. Several items in the audit are already done and
were mis-read; four gaps are real.

### Audit items that are actually implemented (no work needed)

- **FYI holiday / all-day filter before the meeting count.** `isLoadBearingEvent()`
  (excludes `is_all_day` and FYI holiday feeds) is applied at
  `smart-nudges/index.ts:1727`, and `eventCount` — the number driving `dayType` and
  every "N meetings today" line — is `loadBearingEvents.length`, not
  `nonNoiseEvents.length`. The audit read the wrong variable.
- **iOS fresh location fix on resume.** It is implemented in the web layer, not in
  `AppDelegate.swift`: `src/services/travelStateService.ts` exports
  `refreshLocationOnResume()` (`maximumAge: 0`, throttled to once per 30 min) and it
  is wired to the `visibilitychange` handler, which fires on every Capacitor
  foreground resume. Checking only AppDelegate missed it.
- **`persist-travel-location` DB error logging.** Both the ping insert and the
  `travel_state` upsert log via `console.error` and the state write returns a real
  error response.
- **The deterministic "morning state was low" line is reachable but provenance-true.**
  `getFallbackNudgeTwoRecalibrateCopy` is only called from a branch gated on a real
  low morning check-in, and the copy is additionally passed through
  `violatesTruthContract`.
- Gemini backoff, Week Ahead riding the evening slot under the daily cap, metric
  polarity SSOT, critical-trace sampling fix, per-window TTL and the em-dash rule are
  all present as claimed.

### The four real gaps

1. **GPS distance never promotes a travel day.** `_shared/travel/travel-day.ts`
   defines `TRAVEL_DAY_THRESHOLD_KM = 50` and `isTravelDayFromDistance()`, but no
   caller in `smart-nudges` uses it. `dayContext.kind` is still set only from
   calendar-title keywords (`detectDayKindFromEvents`), and the CEO rule context is
   handed `timezone.travelDay: false` hard-coded at `index.ts:3153`, even though
   `distance_from_home_km` is already read from `travel_state` a few lines above.
   A London → Oxford day is invisible.
2. **The static recalibrate fallback is not phase-checked.** The static validator
   calls `violatesTruthContract(copy.body, ctx)` with no `anchorPhase`, so
   "…and {event} is next" survives even when that event is already underway or over.
   The LLM path does pass the phase.
3. **No travel provenance in the logs.** `travelDayReason()` exists and is unused, so
   there is no way to tell from a trace whether travel came from GPS distance, a
   timezone change, the state machine, or a calendar title.
4. **Full-day arcs still count as N meetings.** A single all-day conference or an
   unbroken multi-hour block inflates `eventCount` and can read as heavy.

## What to change

### 1. Wire the travel SSOT into Smart Nudges

- In `buildNudgeContext`, move the existing `travel_state` read (currently inline
  near `index.ts:3105`) so its `state` and `distance_from_home_km` land on the nudge
  context alongside a staleness flag derived from `_shared/travel/freshness.ts`.
- Compute one `travelDay` verdict with `isTravelDayFromDistance({ distanceKm, state,
  timezoneChanged, locationStale })` and store it plus `travelDayReason()` on the
  context.
- Set `dayContext.kind = "travel-day"` when either the calendar-title detector or the
  distance verdict says so — the title path stays as-is, distance only adds.
- Replace the hard-coded `timezone.travelDay: false` at `index.ts:3153` with the
  computed verdict, so the CEO travel rules see domestic trips.

### 2. Phase-check the static fallbacks

- Resolve the anchor event's phase where the static recalibrate branch picks its copy
  and pass it into `violatesTruthContract` in `validateStaticFallbackCopy`, matching
  the LLM path.
- Rewrite `getFallbackNudgeTwoRecalibrateCopy` to take the phase and use
  `phaseClause()` so an underway event reads "underway" rather than "is next".

### 3. Travel provenance telemetry

- Add `travel_day`, `travel_reason` (`gps_distance` | `timezone` | `state_machine` |
  `calendar_title` | `none`) and `distance_from_home_km` to the existing nudge trace
  payload, so a missed Oxford day is diagnosable from the logs.

### 4. Collapse full-day arcs in the count

- Before counting, collapse a contiguous run of load-bearing events with gaps under
  15 minutes into one arc, and treat an all-day conference-style block as one item.
- `eventCount` becomes the collapsed count; the raw list stays available for gap and
  phase logic so nothing else shifts.

## Verification

- Deno tests for the nudge context: 60 km same-timezone distance → travel day with
  reason `gps_distance`; stale fix + 60 km → not a travel day; timezone change with no
  distance → travel day with reason `timezone`.
- A test asserting the static recalibrate copy never says "is next" for an underway
  anchor.
- An arc-collapse test: five back-to-back 45-minute blocks count as one arc, not five.
- Redeploy `smart-nudges` and confirm a live tick emits the new provenance fields.

## Out of scope

The 7-pillar selection layer over the A–H taxonomy, and the Brief/Plan
`ptoTodayAllDay` stubs, stay deferred to their own pass.
