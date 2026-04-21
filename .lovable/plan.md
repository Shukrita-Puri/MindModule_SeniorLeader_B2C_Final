

## Calendar continuity + correlation fix — make calendar sync proactive AND retain history for HR↔event pattern analysis

### What's actually happening (root cause)

Good news first: **calendar background sync is already running.** The `sync-calendar-scheduled` edge function fires server-side on a cron — your DB shows all 5 active connections were synced 28 minutes ago without any user opening the app. That part works. Token refresh (`refresh-calendar-tokens`) is also cron-driven.

But the architecture has **three structural gaps** that block the proactive + correlation use case you described:

1. **History is destroyed every sync.** `sync-calendar/index.ts` does `DELETE FROM calendar_events WHERE user_id = ?` then re-inserts only the "today → +7 days" window. Yesterday's board meeting is wiped from the DB ~30 min after it ends. Your wearable_data keeps 90+ days; your calendar keeps **0 days of history.** They can never be joined for "this meeting type spikes my HR" analysis.

2. **The sync is poll-only (~30-min cadence).** No webhook channel from Google/Outlook. If you add a 1pm meeting at 12:50pm, the Performance Readiness Brief and JIT pipeline won't see it until the next cron tick. Not "proactive" in the way wearables now are.

3. **Cron is a global heartbeat, not event-driven.** Every active user gets synced on the same schedule whether their calendar changed or not — wasteful, and still slow for the user whose calendar just changed.

Confirmed in DB: 5 active connections, last_sync 28 min ago, but only **3 users have any events stored** and the earliest event in the entire `calendar_events` table is `2026-04-21 08:00` — i.e. today. Zero historical data exists for correlation today.

### The fix — three layers, mirroring the wearable architecture

#### Layer 1 — Stop destroying history (the prerequisite for correlation)

Replace the `DELETE → INSERT` pattern in `sync-calendar/index.ts` with **upsert + scoped delete**:

- **Upsert** events on `(user_id, external_id)` — needs a unique index migration.
- **Scoped delete** only removes events whose `external_id` is no longer in the upstream API response **AND whose `start_time >= today`**. Past events are never deleted.
- Keep a **90-day retention floor** on past events (matches wearable_data window). A nightly cleanup cron prunes events older than 90 days.

This single change unlocks HR↔event correlation: with 90 days of past events + 90 days of HRV, the existing `historicalPatternEngine.ts` and `performance-rhythm-insights` function can finally compute "Board meetings drop your HRV by 18% the next morning" — patterns that simply cannot exist with today's 0-day history.

Migration:
```sql
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_user_external_unique UNIQUE (user_id, external_id);
```

#### Layer 2 — Real-time push (Google Calendar webhooks)

Add a `calendar-webhook` edge function and a `register-calendar-watch` action:

- On calendar connect AND on a daily cron, call Google's `events.watch` API to subscribe to push notifications for the user's primary calendar. (Outlook equivalent: Microsoft Graph `subscriptions` endpoint.)
- Google calls our `calendar-webhook` endpoint within ~30 seconds of any event create/move/delete. The webhook just enqueues a sync for that user (calls `sync-calendar` with `_internalUserId`).
- Subscriptions expire after 7 days for Google / ~3 days for Outlook → the daily cron renews them.
- Store `webhook_channel_id`, `webhook_resource_id`, `webhook_expiration` on `calendar_connections`.

Result: a meeting added at 12:50pm appears in your DB by 12:51pm, not 1:20pm. JIT plans, the brief, and the homepage stay fresh in real time.

Migration:
```sql
ALTER TABLE calendar_connections
  ADD COLUMN webhook_channel_id TEXT,
  ADD COLUMN webhook_resource_id TEXT,
  ADD COLUMN webhook_expiration TIMESTAMPTZ;
```

#### Layer 3 — Lookback window + correlation surface

`sync-calendar` window changes from `[today, today+7d]` to:

- **First sync after connect:** `[today−30d, today+8d]` (one-time backfill — Google allows up to 250 results per page; paginate if needed).
- **All subsequent syncs:** `[today−2d, today+8d]` (covers timezone edge cases + recently-edited past events that Google sometimes mutates).

This gives the correlation engine 30 days of past events on day one, growing organically.

**New view for correlation:** `event_physiology_join` (DB view, not a table):
```sql
CREATE VIEW event_physiology_join AS
SELECT 
  e.user_id, e.id AS event_id, e.title, e.start_time, e.end_time,
  e.event_metadata->>'eventType' AS event_type,
  (e.event_metadata->>'isHighStakes')::boolean AS is_high_stakes,
  w_before.hrv_avg AS hrv_morning_of,
  w_after.hrv_avg AS hrv_next_morning,
  w_after.hrv_avg - w_before.hrv_avg AS hrv_delta
FROM calendar_events e
LEFT JOIN wearable_data w_before 
  ON w_before.user_id = e.user_id 
  AND w_before.summary_date = (e.start_time AT TIME ZONE 'UTC')::date
LEFT JOIN wearable_data w_after 
  ON w_after.user_id = e.user_id 
  AND w_after.summary_date = (e.start_time AT TIME ZONE 'UTC')::date + 1
WHERE e.start_time < now() - interval '12 hours';
```

Powers the HRV↔event correlation insight in `performance-rhythm-insights` (already attempts this in "Path A" but currently returns nothing because no past events exist).

### Files touched

| File | Change |
|---|---|
| `supabase/functions/sync-calendar/index.ts` | Replace DELETE+INSERT with upsert; expand window for first-sync; preserve past events |
| `supabase/functions/calendar-webhook/index.ts` | NEW — Google/Outlook push notification handler; enqueues per-user sync |
| `supabase/functions/register-calendar-watch/index.ts` | NEW — Subscribes/renews watch channels; called on connect + daily cron |
| `supabase/functions/calendar-auth/index.ts` | After OAuth success, call register-calendar-watch + first-sync with 30d backfill |
| `supabase/functions/refresh-calendar-tokens/index.ts` | Also renew expiring webhook channels in same pass |
| `supabase/migrations/<ts>_calendar_history_and_webhooks.sql` | Unique index `(user_id, external_id)`; webhook channel columns; `event_physiology_join` view; 90-day retention cleanup function |
| Cron job (via insert tool, not migration) | Schedule `register-calendar-watch` daily; calendar-events 90-day cleanup nightly |
| `supabase/functions/performance-rhythm-insights/index.ts` | Switch HRV-correlation Path A to query `event_physiology_join` view directly |

### What this changes for you

- **Wearable + Calendar history both retained 90 days** → real "this client call type drops my HRV next morning" patterns surface in Performance Intelligence.
- **Sub-minute reaction time** when a meeting is added/moved (vs 30 min today) → JIT plans and the brief feel genuinely proactive.
- **No "calendar disconnect" UX flips** — webhook expiry handled silently by daily cron.
- **`event_physiology_join`** is queryable from any edge function — single source of truth for correlation, no more recomputing joins ad hoc.

### Verification

1. **History retention probe:** Add a test event for "yesterday", trigger sync, confirm row persists in `calendar_events` after a second sync 5 min later.
2. **Webhook latency probe:** Add an event in Google Calendar UI, confirm `calendar_events` row appears within 90 seconds (no manual sync, no app open).
3. **Backfill probe:** Disconnect a test calendar, reconnect, confirm `MIN(start_time)` is ~30 days in the past.
4. **Correlation probe:** Query `event_physiology_join` after 14+ days of data — confirm `hrv_delta` populated for past events.
5. **Webhook renewal probe:** Manually expire a `webhook_expiration` to 1 hour ago, run the daily cron, confirm new `webhook_channel_id` issued.

### Out of scope

- Apple Calendar / iCloud sync (no public push API — would require an iOS native EventKit observer, separate work)
- Per-meeting HR (intra-event) correlation — current wearable_data is daily-aggregated; intra-day requires a `wearable_intraday` table (separate plan).
- Changing event classification logic or JIT scoring — those stay as-is, they just get more data to work with.
- Outlook webhook implementation in v1 — ship Google first; Outlook subscription endpoint follows same pattern but lower urgency given user base.

