# End-to-end validation of today's travel changes (with iOS coverage)

Goal: prove that every travel change made today actually works, on the phone as well as the web app, and record exactly what is verified versus what only takes effect in the next iOS build.

## What is already in place (confirmed by reading the code)

- Coordinate-less reports no longer overwrite travel state.
- The hourly background refresh is registered and running.
- Trip detection from the calendar looks 14 days back, and an ongoing trip reads as "arrived".
- Trip windows are stored per person, rebuilt on every hourly run, and there is a one-off history pass over past calendar entries.
- A position far from home opens a trip window on its own, so no calendar entry is needed.
- The iOS side has a real location component with while-using-the-app permission, one-off position requests, significant-movement and arrival/departure monitoring, and it uploads positions with the signed-in user's token. The app asks it to arm itself on launch and on every return to the foreground.

## Validation steps

### 1. Automated checks
- Run the travel test suites and the app test suite; both must stay green.
- Run the type check; must be clean.

### 2. Database truth
- Confirm no record is stuck on "location unknown".
- Confirm the hourly job is registered and active, and that its last runs succeeded.
- Confirm recorded trip history exists per person, and that Shukrita's 9-17 August New York trip is present as one continuous trip.
- Confirm the history pass over past calendar entries has been run for everyone, not just for her.

### 3. Live behaviour
- Trigger the refresh once by hand and check that existing trips survive and nothing is cleared.
- Send a coordinate-less report and confirm state, last position and trip history are untouched.
- Send a simulated far-from-home position (Oxford distance) and confirm a new trip day appears; then restore the real values.
- Confirm the day view reports a travel day from trip history alone, with no calendar entry.

### 4. iOS-specific checks (this is the part that needs the most care)
- Verify the phone component is registered with the app shell and reachable from the app code, and that the method names the app calls match the ones the phone side exposes.
- Verify the permission text and the background capability list in the phone app settings are sufficient for arrival/departure and significant-movement reporting. Today the background capability list only names push notifications; confirm whether the location entry is required for reporting while the app is closed, and add it if so.
- Verify the phone uploads positions using the signed-in user's stored credentials and that the upload succeeds against the live endpoint.
- Verify the silent while-using-the-app permission request fires only on a phone, only when permission has never been decided, and honours the 7-day gap.
- Verify the one-off position request on launch and resume honours its three-hour gap.
- Confirm the Android equivalent behaves the same or note the gap.

### 5. Report
A short table: each change, how it was verified, result. Anything that can only be confirmed in the next phone build will be stated as such rather than claimed as verified.

## Technical notes

- Files under review: `supabase/functions/persist-travel-location/index.ts`, `supabase/functions/travel-state-sync/index.ts`, `derive.ts`, `_shared/travel/trip-windows.ts`, `_shared/travel/hydrate-travel-day.ts`, `src/services/travelStateService.ts`, `src/App.tsx`, `ios/App/App/LocationBridge*.swift`, `ios/App/App/Info.plist`, the Android plugin.
- Checks are read-only apart from the simulated position, which is reverted, and any `Info.plist` capability fix.
- No new screens, dialogs or prompts are added.

## Fixes expected to come out of this

Only defects the validation actually exposes get fixed, in the same pass:
- the missing location background capability on iOS, if confirmed required;
- any mismatch between the names the app calls and the phone component's methods;
- any Android gap versus iOS.
