# Travel recording audit — why the trips are missing, and what to fix

## What the live data shows (verified, not assumed)

Shukrita's account (home anchor set 16 July, London, GB):

- **Location pings**: 112 in total, but the last one is **27 August**. There are **no pings at all between 10 and 16 August** and **none in September**. Her 9 August pings top out 20 km from home — the day she flew.
- **Her travel record** currently says `location_unknown`, with distance 0.1 km and a location timestamp of 27 August.
- **The New York trip is in the calendar** ("Flight to New York (BA 183)" 9 Aug, "Stay at DoubleTree… New York" 9–17 Aug, "Flight to LHR (BA 188)" 17 Aug). **Nothing in September looks like travel in the calendar** — no flight, hotel, train or trip entry — so the 1 September trip had no evidence of any kind.

Across all users:

- 43 profiles, but only **2 have a home location set** and only **2 have ever sent a ping** (only 1 in the last two weeks).
- **All 18 travel records say `location_unknown`**, and **not one has a fresh location fix**.
- **Every** record has permission status `not_determined` — the phone-side "always allow location" permission has never been recorded as granted for anybody.

## Three real causes

**1. A location-less check-in wipes the travel record.**
The app periodically reports just the permission status, with no coordinates. The server treats "no coordinates" as `location_unknown` and overwrites whatever was there. That is why all 18 records read `location_unknown` and are still being rewritten today. Once someone is abroad and their phone goes quiet, the next permission report erases the trip.

**2. The scheduled backstop never runs.**
There is a backstop service (`travel-state-sync`) built exactly for this case — it reads the calendar and timezone and marks travel when the phone is silent. It is **not in the scheduled-jobs list at all**. The only trace of it ever running is a single manual run on 16 July. Had it been scheduled, the New York flight entry would have marked the trip even with no pings.

**3. Nothing ever asks for the location permission.**
Zero users show a granted permission. Without it, the phone stops sending pings the moment the app is closed — which matches the 10–16 August silence exactly.

Net: **no, future trips will not reliably be recorded as things stand**, and hydration does not currently work for any user — every record is `location_unknown` and treated as no signal.

## Fix plan

### 1. Never let a coordinate-less report destroy travel state
`supabase/functions/persist-travel-location/index.ts`

- When a report carries no coordinates (permission sync, web session): update only the permission status, timezone and bookkeeping. **Keep the existing state, distance, last-known coordinates and country untouched.**
- Reserve `location_unknown` for a genuinely new record with no prior state.
- Stop nulling `current_country` on non-travel writes; only clear it when a fresh fix proves the person is home.

### 2. Schedule the backstop
New migration adding a cron job `travel-state-sync-hourly` (hourly, same pattern as the existing 15-minute jobs, service-role call). This makes calendar and timezone evidence work for everyone, phone or no phone.

### 3. Let the calendar mark travel on its own
`travel-state-sync` currently only looks 12 hours back / 24 hours forward, so a week-long trip is invisible from day two onwards. Widen it to detect an **ongoing** trip: a travel entry (flight/hotel/train) that started up to 14 days ago and has not yet ended keeps the person in `arrived`, and the return leg moves them back. This is the piece that would have covered 10–16 August.

### 4. Backfill the stuck records
One-off statement in the same migration: for the 18 records sitting at `location_unknown` with no fresh fix, reset to `not_travelling` so the backstop can classify them cleanly from the next run.

### 5. Ask for the permission
`src/services/travelStateService.ts` already has a request path and a 7-day cool-down but nothing triggers it. Trigger the in-app rationale + request once for signed-in phone users who have never been asked, respecting the existing cool-down. No change to the flow for web users.

## Verification

- Re-run the backstop for Shukrita and confirm the August trip window classifies as travel from the calendar alone.
- Confirm a permission-only report no longer changes state (unit test on the state derivation).
- Confirm the scheduled job appears in the job list and its runs show up in the logs.
- Existing Deno and frontend suites stay green.

## Technical notes

- Files: `supabase/functions/persist-travel-location/index.ts` (`deriveState` + upsert), `supabase/functions/travel-state-sync/index.ts` (`hasTravelCalendarEvent` → ongoing-trip window), `supabase/functions/travel-state-sync/derive.ts` (calendar signal may set `arrived`, not just `travel_planned`, when a trip is in progress), new `supabase/migrations/<ts>_travel_state_sync_cron.sql`, `src/services/travelStateService.ts`.
- The fail-open contract in `derive.ts` is preserved: advisory signals may promote, never clear an away state; only a fresh fix under 25 km returns someone home.
- `freshness.ts` and `hydrate-travel-day.ts` need no change — they behave correctly once the records stop being overwritten.
