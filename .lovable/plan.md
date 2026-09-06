# Make location alone enough to record a trip (iOS first, no new UI)

Today a trip is only remembered as a dated "trip window" when the calendar
says so (a flight, a hotel, a conference). Distance from home changes the
live state ("away right now") but leaves no trace of which days were travel
days. So a London to Oxford day trip on 26 September — same timezone, no
calendar entry — would show as away only while she is there, then vanish.

This plan closes that gap on the phone app. No new screens, no popups, no
extra prompts: the Home location card in Profile simply starts showing real
values instead of "Location Unknown" / "52 d ago".

## What changes

1. **Distance opens a real trip window.** When a fresh position lands more
   than 50 km from home, that date is recorded as a travel day (source:
   location). Further days away extend the same window; the first fresh
   position back within 25 km of home closes it. Finished trips stay on
   record, so 26 September will still read as a travel day afterwards.

2. **The hourly background refresh maintains those windows too**, so a trip
   is recorded correctly even when positions arrive sparsely. Calendar-derived
   trips are never overwritten by location ones, and vice versa.

3. **Day view reads it.** The day-level travel answer already checks trip
   windows first, so intercity travel with no calendar block counts.

4. **iOS reporting made reliable.** No position has been reported since
   27 August. On the phone app the position report is refreshed on app open
   and on resume when permission is already granted — silent, using the
   existing native bridge, no prompt beyond the one already agreed in the
   previous run. Web is untouched: no browser location, no prompt there.

5. **Profile card reflects reality.** The existing Home location card keeps
   its current layout and wording; it will show the up-to-date travel state
   and last sync once positions flow again. Nothing is added to it.

## Technical detail

- `supabase/functions/travel-state-sync/trip-windows.ts`: add
  `upsertLocationWindow(trips, isoDate, { away })` — opens or extends a
  `source: "location"`, `confidence: "high"` window while away, closes it on
  a confirmed near-home fix. Pure, unit-tested with the existing helpers.
- `supabase/functions/persist-travel-location/index.ts`: after the existing
  state upsert, when the ping is fresh and distance is known, merge the
  location window into `travel_state.meta.trips` (read-modify-write of the
  existing `meta` JSON — no new table, no new column).
- `supabase/functions/travel-state-sync/index.ts`: same merge inside
  `syncUser` from `last_known_lat/lng` + `last_location_at`, after the
  calendar rebuild, so both producers agree.
- `supabase/functions/_shared/travel/hydrate-travel-day.ts`: no change — the
  `trip` rung already reads `meta.trips`.
- `src/services/travelStateService.ts` / `src/App.tsx`: on native platforms
  only, call `startIfAuthorized()` + `requestOneShotLocation()` on app open
  and on resume when the status is already granted. Guarded so it fires at
  most once every few hours. No-op on web. No UI, no toast, no modal.
- Everything from the previous run (silent when-in-use request, hourly cron,
  14-day calendar window, `arrived` mid-trip, no-coordinate safety) stays as
  built and is confirmed to be on the iOS path; the one-shot refresh above is
  what actually makes it produce data on device.

## Verification

- Unit tests for the location-window helper plus the existing travel suites,
  all green; clean type check.
- Simulate an Oxford-distance position for the test account and confirm a
  `source: "location"` window appears for that date and that the day view
  reports a travel day.
- Confirm the 9–17 August calendar window is untouched by the run.
- Confirm the Home location card renders the refreshed state with no layout
  change.

Note: the on-device parts only take effect in the next iOS build.
