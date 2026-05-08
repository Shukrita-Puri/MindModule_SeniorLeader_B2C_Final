# Calendar multi-provider plan

## Phase 1 — Google Calendar audit results

Inspected: `ConnectedData.tsx`, `CalendarConnectionSettings.tsx`, `useCalendarSync.ts`, and edge functions `calendar-auth`, `sync-calendar`, `check-connections-status`, `check-calendar-status`, `register-calendar-watch`, `calendar-webhook`.

**Healthy:**
- OAuth URL gen (Google + Microsoft) ✓
- Auth0-token POST flow from `ConnectedData.tsx` → `calendar-auth` / `sync-calendar` / `check-connections-status` ✓
- AES-256-GCM encrypted access + refresh tokens with separate IVs ✓
- Proactive refresh (5-min buffer), refresh-token preservation when Google omits it ✓
- Webhook watch channel registration on connect + cron renewal ✓
- `calendar_connections` already unique on `(user_id, provider)` and `check-connections-status` returns per-provider state ✓

**Issues to fix before Apple work:**

1. **Cross-provider event wipe (CRITICAL).** `sync-calendar` scoped delete is `WHERE user_id = X AND start_time IN window AND external_id NOT IN upstream`. With no `provider` column on `calendar_events`, a Google sync will delete Microsoft (and future Apple) events that fall in the window. Same for the empty-window branch.
2. **Upsert key is not provider-scoped.** `onConflict: 'user_id,external_id'` collides if two providers ever share an `external_id` shape.
3. **`useCalendarSync.ts` reads `calendar_connections` and `calendar_events` directly from the frontend** and assumes a single connection (`maybeSingle()`), so a user with both Google + Microsoft gets a non-deterministic connection row and only sees one provider's events at a time. Switch to `check-connections-status` + `sync-calendar` + a thin events read (or a new `list-calendar-events` edge function) and drop the single-row assumption.
4. **`calendar_events` RLS** uses `auth.jwt() ->> 'sub'` — works because Auth0 JWT is forwarded; keep it but treat reads as best-effort. Writes already go through service role in `sync-calendar`. No change needed beyond schema.

## Phase 2 — Provider-scoped `calendar_events` schema

Migration:
- `ALTER TABLE calendar_events ADD COLUMN provider text` (nullable for backfill).
- Backfill `UPDATE calendar_events SET provider='google' WHERE provider IS NULL` (Google is the only existing source).
- `ALTER COLUMN provider SET NOT NULL DEFAULT 'google'`.
- Drop both old uniques `calendar_events_user_external_unique` and `calendar_events_user_id_external_id_key`.
- `CREATE UNIQUE INDEX calendar_events_user_provider_external_key ON calendar_events (user_id, provider, external_id)`.
- Extend `calendar_connections_provider_check` to allow `'apple'`.

Code changes:
- `sync-calendar`:
  - Set `provider` on each row built from Google/Microsoft API responses.
  - `upsert(..., { onConflict: 'user_id,provider,external_id' })`.
  - Scope both delete branches with `.eq('provider', provider)` so Google sync only prunes Google rows (Microsoft sync only Microsoft, Apple sync only Apple).
- `useCalendarSync.ts`: add `.eq('provider', ...)` when reading events if a single provider context is needed; otherwise leave provider-agnostic for the unified upcoming-events view (preferred — readiness/JIT consume all providers).
- No changes to webhook/watch (Google-only by design).

## Phase 3 — Apple Calendar (EventKit), native iOS only

### iOS native bridge
- New Swift plugin `AppleCalendarBridge` exposing `requestPermission()` and `fetchEvents({startISO, endISO})`.
- iOS 17+: `EKEventStore.requestFullAccessToEvents`; iOS 16: `requestAccess(to: .event)`.
- `Info.plist`: add `NSCalendarsFullAccessUsageDescription` (iOS 17+) and `NSCalendarsUsageDescription` (iOS 16) — copy: "MindModule reads your upcoming calendar events to tailor daily readiness and nudges."
- Bridge returns normalized array: `{ external_id (eventIdentifier), title, start_time, end_time, attendees_count (event.attendees?.count), is_organizer (event.organizer?.isCurrentUser), is_recurring (event.hasRecurrenceRules), event_metadata: { location, calendarTitle, isAllDay, url } }`.
- Register the plugin in `AppDelegate` / `CapApp-SPM` per existing wearable bridge pattern.

### Frontend (`src/utils/appleCalendar.ts` + `useAppleCalendar.ts`)
- `isNativeApp() && Capacitor.getPlatform() === 'ios'` gate.
- Methods: `requestAppleCalendarPermission()`, `fetchAppleCalendarEvents(windowStart, windowEnd)`, `syncAppleCalendarToBackend()`.
- `syncAppleCalendarToBackend` POSTs to a new edge function `sync-apple-calendar` with Auth0 Bearer token and `{ events: [...] }`.

### New edge function `sync-apple-calendar`
- Auth via `verifyAuth0Token` (same pattern as `sync-calendar`).
- Uses service role client.
- Validates body with zod (`events: array`, `windowStart`, `windowEnd`).
- Ensures a `calendar_connections` row exists for `(user_id, provider='apple')`, marks `is_active=true`, updates `last_sync`. No tokens stored (device-side permission).
- Reuses Google's classification/logistic-keyword logic (factor into shared inline helper).
- `upsert(events, { onConflict: 'user_id,provider,external_id' })` with `provider='apple'`.
- Scoped delete: `eq user_id`, `eq provider 'apple'`, within `[windowStart, windowEnd]`, `external_id NOT IN upstream`.
- Returns `{ success, eventCount, lastSync }`.
- Disconnect path handled by extending `calendar-auth` `disconnect` to accept `provider='apple'` (set `is_active=false`, no token cleanup needed; also `delete from calendar_events where user_id=? and provider='apple'`).

### `check-connections-status`
- Add `apple: { connected, lastSync }` block (only populated if a row exists for provider='apple').
- Existing `providers.google` / `providers.microsoft` stay; add `providers.apple`.

### UI (`ConnectedData.tsx`)
- Add Apple Calendar card rendered only when `isNativeApp() && Capacitor.getPlatform() === 'ios'`.
- Reuses existing card style (similar to Apple Health card).
- Connect handler: request permission → on grant call `syncAppleCalendarToBackend` → toast + invalidate plan/readiness caches like Google.
- Sync Now and Disconnect handlers per-provider, calling `sync-apple-calendar` and `calendar-auth` (action=`disconnect`, provider=`apple`).
- Web build never renders the card; Google + Microsoft cards unchanged.

### Background refresh
- iOS-only: trigger a foreground sync on app resume from `usePushNotificationHandler`/app-state listener (best-effort, non-blocking).

## Verification

- `npm run build` (auto by harness) and ESLint on touched files.
- DB: confirm `provider` column populated, new unique index present, old unique dropped.
- Google: connect → sync → events stored with `provider='google'`, `last_sync` updates, webhook channel recorded.
- Mixed scenario: pre-seed an Apple-style row, run Google sync, verify Apple rows remain.
- Apple (TestFlight): permission prompt appears, events appear in DB with `provider='apple'`, disconnect removes only Apple rows.
- Microsoft sync still works unchanged.

## Out of scope

Push notification code, Apple Health, notification copy, wearable flows, downstream brief/plan/insights consumers (will be revisited after the calendar foundation lands).
