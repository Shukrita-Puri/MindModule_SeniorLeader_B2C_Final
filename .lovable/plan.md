# Travel awareness must override Light Day notification copy

## Confirmed cause

Today’s live records show travel awareness worked:

- At 14:15 London, the last location was stale and near home, so the notification context was still `normal`.
- By 17:00, the app had a fresh iPhone location **80.9 km from home**. The travel state was `arrived`, `travel_day=true`, and the day context correctly became `travel-day`.
- Despite that, the separate Light Day check still returned `light_day_weekend` and sent: “First day off — 1 meeting today…”

The mismatch is in `smart-nudges`: it calculates the correct travel verdict, but does **not pass `travelDaySignal` into the shared Light Day classifier**. The shared classifier already contains the correct rule—travel exits before weekend/light-day handling—but it cannot apply that rule without the signal.

There is a second boundary: current explicit travel notification copy is mainly tied to a calendar-detected pre-flight or in-flight event. A location-confirmed travel day can therefore be recognised as travel without producing travel-specific copy, then fall through to the generic evening message.

## Changes

1. **Make travel win before Light Day**
   - Pass the already-computed travel verdict into `classifyLightDay` inside `smart-nudges`.
   - Keep the shared order unchanged: Travel → Conference → packed day → Light Day.
   - A weekend while more than 50 km from home must return `override_travel_day`, never `light_day_weekend`.

2. **Use travel-aware notification framing for location-confirmed travel**
   - When the day context is `travel-day` from fresh distance/state evidence, prevent generic weekend/light-day copy from entering the candidate queue.
   - Reuse the existing travel-day notification behavior and copy contracts; do not invent a new notification type, timing window, or travel detector.
   - Calendar pre-flight/in-flight copy remains unchanged. Location-confirmed arrival/travel uses the existing travel state as its anchor rather than requiring “flight” in an event title.

3. **Keep the change isolated**
   - Do not alter travel detection, the 50 km rule, location freshness, trip windows, A–H categorisation, Light Day’s definition, daily caps, quiet hours, spacing, Week Ahead, Plan, Brief, Insights, JIT, readiness, or pattern rules.
   - No database, frontend, iOS, Android, or schema changes.

## Verification

- Add a regression case matching today: Saturday, one meeting, fresh location 80.9 km from home, state `arrived` → travel day, not Light Day; no “First day off” copy.
- Confirm the same Saturday at home still receives normal Light Day weekend copy.
- Confirm stale/unknown location continues to follow the existing persisted-state fallback.
- Confirm calendar pre-flight and in-flight notification tests remain unchanged.
- Run the Smart Nudge tests and type check, deploy only `smart-nudges`, then run a dry evaluation on the account and verify the trace records `override_travel_day` plus travel-framed output.
