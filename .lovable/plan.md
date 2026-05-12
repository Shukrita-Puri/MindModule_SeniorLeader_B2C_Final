# Apple Calendar / Apple Health — Copy + Sync Fix + Cross-Platform Primacy

## Issue 1 — Subtext copy uses old shortened version (not your verbatim 75-char copy)

The previous edit shortened the strings further than you wanted. Replace with your exact strings in `src/pages/ConnectedData.tsx` (lines 1014, 1030, 1046, 1068):

- **Google Calendar** → "Get a daily brief and nudges tuned to your real meeting load, decision density, and high stakes events - so practices land when they matter."
- **Microsoft Outlook Calendar** → "Tune your brief and nudges to your Outlook meeting load, decision density and high pressure events - so practices land before high-stakes moments."
- **Apple Calendar** → "Tune your brief and nudges to your real meeting load, decision density, and high pressure events - so practices land before high-stakes moments."
- **Apple Health** → "Share HRV, resting HR, sleep, and HR so your readiness reflects your real physiology."

There is no separate iOS-only copy file — the iOS Capacitor shell renders the same `ConnectedData.tsx`, so this fix covers both surfaces on the next app load.

---

## Issue 2 — Apple Calendar not syncing for shukrita@mindmodule.me (and likely most users)

### Root cause (confirmed in DB + edge function logs)

`shukrita@mindmodule.me` (`google-oauth2|111878424918915566691`):
- `calendar_connections` row for `provider='apple'` is active and `last_sync` updates every minute.
- iOS app posts 21 events to `sync-apple-calendar`.
- Every upsert fails with: `code 21000 — ON CONFLICT DO UPDATE command cannot affect row a second time`.
- Result: **0 Apple events** stored in `calendar_events` for this user. Across the entire DB only one user has any Apple events stored.

**Why:** Apple EventKit returns each occurrence of a recurring event with the *same* `eventIdentifier` (only `start_time` differs). The Swift bridge forwards each occurrence using `eventIdentifier` as `external_id`. The edge function upserts on `(user_id, provider, external_id)`, so two occurrences of the same recurring meeting in one payload collide and Postgres aborts the whole batch.

### Fix — `supabase/functions/sync-apple-calendar/index.ts`

In the `classified` mapping (around lines 136–150):

```ts
const externalId = e.is_recurring
  ? `${e.external_id}::${e.start_time}`
  : e.external_id;
```

Use `externalId` for the row. Then defensively dedupe the array by the final composite key before the upsert (and before building the scoped-delete `upstreamIds` list):

```ts
const byKey = new Map<string, typeof classified[number]>();
for (const row of classified) {
  byKey.set(`${row.external_id}`, row);
}
const deduped = Array.from(byKey.values());
```

No DB migration. Uniqueness key `(user_id, provider, external_id)` still holds; recurring occurrences just get distinct ids.

### Verification

1. Trigger a sync from the iOS app for Shukrita.
2. Logs: `sync-apple-calendar` returns 200 with `eventCount > 0` and **no** `Upsert error`.
3. DB: `select count(*) from calendar_events where user_id='google-oauth2|111878424918915566691' and provider='apple'` returns ~21.

---

## Issue 3 — Cross-platform calendar primacy (NEW)

### Goal

If a user has *ever* successfully connected Apple Calendar via the iOS app, then:
- On the iOS app → continue to show Apple Calendar only (current behavior).
- On the web app (mobile web or desktop) → show **Apple Calendar as the connected, primary calendar**, and still show Google + Microsoft cards as available options (so the user can layer them in if they want).

If a user has *never* connected Apple Calendar (web-only user) → continue to show only Google + Microsoft (current behavior).

This avoids double-counting (Apple Calendar typically already aggregates the user's Google + Microsoft accounts on iOS), and makes the iOS device the authoritative source of meeting load when present.

### Where this lives today

`src/pages/ConnectedData.tsx` (lines 1007–1064):

```ts
const showAppleCalendar = isAppleCalendarSupported(); // iOS-native only
const showWebCalendars  = !showAppleCalendar;
```

So today, on web, Apple Calendar is hidden entirely — even if the user has an active Apple connection in the DB.

### Proposed behavior

**Connection visibility matrix:**

| Surface  | Has Apple connection in DB? | Apple card | Google card | Microsoft card |
|----------|------------------------------|-----------|-------------|----------------|
| iOS app  | yes or no                    | shown     | hidden      | hidden         |
| Web      | yes                          | shown (read-only "Connected via iOS app") | shown | shown |
| Web      | no                           | hidden    | shown       | shown          |

**Brief / nudges / readiness — event source rules (server-side):**

When computing meeting load / decision density / high-stakes events, use this precedence per user:

1. If `calendar_connections` has an active `apple` row for the user → **use Apple events only**. Ignore Google and Microsoft events for that user even if those connections exist (avoid double-counting).
2. Else if Google active → use Google.
3. Else if Microsoft active → use Microsoft.
4. Else → no calendar context.

The user can still *connect* Google/Microsoft on web for portability/backup, but as long as Apple is active, only Apple events feed the brief.

### Implementation

#### Frontend — `src/pages/ConnectedData.tsx`

1. Detect Apple connection from server status (already loaded as `appleCalendarDbConnected` / via `status?.calendar.providers?.apple`). Add a derived flag `hasAppleConnection` independent of platform.
2. Replace `showWebCalendars = !showAppleCalendar` with:
   - `showAppleCalendar = isAppleCalendarSupported() || hasAppleConnection`
   - `showWebCalendars = !isAppleCalendarSupported()` (web users always see Google/Microsoft as options).
3. On web, when the Apple card is shown because of a DB connection (not because we're on iOS), render it as **read-only**:
   - Status label: "Connected via iOS app".
   - Disable Connect / Sync / Disconnect buttons (or show "Manage in iOS app").
   - Keep the same logo + description.
4. Add a one-line helper note above the calendar group on web when Apple is the active source: *"Apple Calendar from your iOS device is the primary source. Google and Microsoft can be added but won't double-count."*

#### Backend — calendar-event reader used by brief / nudges / Today's 3

Identify the helper(s) that read `calendar_events` for the user (likely a shared reader called from `compute-daily-intelligence`, `generate-readiness-brief`, `generate-mastery-plan`, etc.) and apply the precedence:

- Query active `calendar_connections` for the user, ordered: apple > google > microsoft.
- Filter `calendar_events` by `provider = <chosen>` only.
- Log the chosen provider in the function payload for observability.

No schema change. No migration. This is a single source-selection step at the top of the calendar reader.

#### Verification

- A web-only user with Google connected: brief still uses Google events (regression check).
- Shukrita (Apple connected via iOS, also has Google active on web): after Issue 2 fix, brief uses Apple events; her Google events are not counted. On web, the Connected Data screen shows Apple Calendar as "Connected via iOS app" alongside her Google card.
- A user who connects Microsoft on web after already having Apple: Microsoft card shows connected, but brief continues to source from Apple.

---

## Technical summary

- **Frontend:** 4 string replacements + visibility/precedence logic in `src/pages/ConnectedData.tsx`. No new components.
- **Backend (sync):** `sync-apple-calendar` — composite `external_id` for recurring events + batch dedupe. No migration.
- **Backend (read):** Shared calendar-events reader picks one provider per user (apple > google > microsoft). Single-point change.
- **iOS native:** No Swift change required.
