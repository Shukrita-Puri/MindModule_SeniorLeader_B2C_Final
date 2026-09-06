# Make location alone enough to record a trip

Today a trip is only remembered as a dated "trip window" when the calendar
says so (a flight, a hotel, a conference). Distance from home changes the
live state ("away right now") but leaves no trace of which days were travel
days. So a London to Oxford day trip on 26 September — same timezone, no
calendar entry — would show as away while she is there and vanish afterwards.

This plan closes that gap and makes sure the position reports that feed it
actually arrive.

## What changes

1. **Distance opens a real trip window.** When a fresh position lands more
   than 50 km from home, that date is recorded as a travel day (source:
   location). Further days away extend the same window; the first fresh
   position back within 25 km of home closes it. Windows keep their history
   after the trip ends.

2. **The hourly refresh maintains those windows too**, so a trip is still
   recorded correctly when positions arrive sparsely, and calendar-derived
   windows are never overwritten by location ones (and vice versa).

3. **Day view reads it.** The day-level travel answer already checks trip
   windows first, so 26 September will read as a travel day from location
   evidence alone, with no calendar block required.

4. **Make sure positions actually arrive.** No position has been reported
   since 27 August, because the silent permission request only ships with the
   next phone build. Alongside that, when the browser has already granted
   location (no new prompt, no popup), the app will report one position on
   open, so intercity trips are still caught between phone releases.

## Technical detail

- `supabase/functions/travel-state-sync/trip-windows.ts`: add
  `upsertLocationWindow(trips, isoDate, { away })` — opens or extends a
  `source: "location"`, `confidence: "high"` window while away, closes it on
  a confirmed near-home fix. Pure, unit-tested alongside the existing helpers.
- `supabase/functions/persist-travel-location/index.ts`: after the existing
  state upsert, when the ping is fresh and distance is known, merge the
  location window into `travel_state.meta.trips` (read-modify-write of the
  existing `meta` JSON — no new table, no new column).
- `supabase/functions/travel-state-sync/index.ts`: apply the same merge in
  `syncUser` from `last_known_lat/lng` + `last_location_at`, after the
  calendar rebuild, so both producers agree.
- `supabase/functions/_shared/travel/hydrate-travel-day.ts`: no change — the
  `trip` rung already reads `meta.trips`.
- `src/services/travelStateService.ts`: on web, when permission status is
  already `web_granted`, take one `navigator.geolocation` reading per app open
  and post it to `persist-travel-location`. Never prompts; unchanged on
  `not_determined` or `denied`.

## Verification

- New unit tests for the location-window helper plus the existing travel
  suites, all green; clean type check.
- Simulate an Oxford-distance position for the test account and confirm a
  `source: "location"` window appears for that date and that the day view
  reports a travel day.
- Confirm the existing 9–17 August calendar window is untouched by the run.
- Re-check on 26 September that the day is recorded once positions flow.
