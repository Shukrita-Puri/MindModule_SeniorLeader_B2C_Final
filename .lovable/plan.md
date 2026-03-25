

# Smart Notifications / Smart Nudges — Full System Documentation & Bug Diagnosis

## Part 1: Full System Documentation

### Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    pg_cron (every 15 min)                │
│              jobid: 4, smart-nudges-every-15m            │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP POST
                        ▼
┌─────────────────────────────────────────────────────────┐
│           Edge Function: smart-nudges/index.ts           │
│                   (1117 lines, verify_jwt=false)         │
│                                                         │
│  1. Fetch all users with active device tokens           │
│  2. Batch-fetch profiles, preferences, recent engagement│
│  3. Per-user evaluation loop:                           │
│     ┌─ Pre-Event Prep (P1 — highest priority)           │
│     ├─ Pattern Alert (P2)                               │
│     ├─ Morning Anchor (P3)                              │
│     ├─ Afternoon Check-In (P4)                          │
│     ├─ Evening Close (P5)                               │
│     ├─ State-Aware Nudge (P6 — lowest priority)         │
│     └─ Daily Fallback (P7 — guarantee 1 touch/day)      │
│  4. Send via APNs HTTP/2 (iOS only)                     │
│  5. Log to notification_log table                       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                 APNs (Apple Push)                        │
│  Host: api.push.apple.com (prod) /                      │
│        api.sandbox.push.apple.com (dev)                  │
│  Bundle: com.moonshot.mindmoduleapp                      │
│  Auth: ES256 JWT (APNS_P8_KEY, APNS_KEY_ID, APNS_TEAM_ID)│
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  iOS Device                              │
│  PushNotificationProvider → useDeviceTokenRegistration   │
│  PushNotificationActionHandler → usePushNotificationHandler│
│  useNotificationEngagement (trackTap/trackDismissed)     │
└─────────────────────────────────────────────────────────┘
```

### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_device_tokens` | Active device tokens per user | `user_id, device_token, platform, is_active` |
| `notification_log` | Every notification sent (audit + suppression) | `user_id, notification_type, variant_id, sent_at, event_reference, payload, tapped, app_opened, target_action_completed, dismissed, time_to_engagement_seconds` |
| `notification_preferences` | Per-user toggles + time windows | `morning_anchor_enabled, pre_event_prep_enabled, evening_close_enabled, pattern_alert_enabled, state_aware_nudge_enabled, morning_window_start/end, evening_window_start/end, dnd_start/end, quiet_days[]` |

### Notification Types — Full Logic

#### Type 1: Pre-Event Prep (highest priority)
- **Window**: Any time
- **Trigger**: Calendar event with high-stakes keywords starting in 30-90 min, score ≥ 25
- **Data needed**: `calendar_events`, `daily_checkins` (inner tier)
- **Suppression**: Max 3/day, dedup by `event_reference` (external_id), 2-hour global suppression
- **Variant selection**: Based on inner tier (strong/peak → PE-3, depleted/managing → PE-4, else round-robin)
- **Copy variants**: PE-1 through PE-6

#### Type 2: Pattern Alert
- **Window**: Any time
- **Trigger**: One of 5 pattern detections (checked in priority order):
  1. **Consecutive Low** (3 days at depleted/managing) → PA-1
  2. **Effectiveness Milestone** (5+ completions of a practice with avg rating ≥ 4.0/5) → PA-2
  3. **Streak Milestone** (exactly 7, 14, or 30 days) → PA-3
  4. **Calendar Correlation** (event type appears on 5+ low-readiness days in 30 days) → PA-4
  5. **Recovery Deficit** (HRV ≥20% below baseline for 3+ consecutive days) → PA-5
- **Suppression**: Max 1/day, same pattern_type suppressed for 7 days, skip if app opened in last 4 hours

#### Type 3: Morning Anchor
- **Window**: `morning_window_start` (default 6) to `morning_window_end - 0.5` (default 8:30)
- **Trigger**: No daily check-in exists for today
- **Data needed**: `daily_checkins`, `calendar_events` (count), `profiles.current_streak`
- **Variant selection**: High calendar pressure → MA-2, streak ≥ 3 → MA-5, else round-robin
- **Copy variants**: MA-1 through MA-6

#### Type 4: Afternoon Check-In
- **Window**: 12:30 - 14:30 local time
- **Trigger**: No afternoon check-in (`time_window = 'afternoon'`) exists for today
- **Copy variants**: AC-1 through AC-3

#### Type 5: Evening Close
- **Window**: `evening_window_start` (default 19) to `evening_window_end - 0.5` (default 21:30)
- **Trigger**: Evening ritual OR evening check-in missing
- **Data needed**: `daily_ritual_completions`, `daily_checkins`, `calendar_events`, `energy_snapshots` (HRV)
- **Variant selection**: Missing check-in → ECI variants, HRV delta ≥15% → EC-4, high load → EC-2, streak ≥3 → EC-5
- **Copy variants**: EC-1 through EC-6, ECI-1, ECI-2

#### Type 6: State-Aware Nudge (lowest priority)
- **Window**: 12:00 - 15:00 local time
- **Trigger**: Morning check-in outcome is depleted/managing AND no afternoon reset completed AND ≥1 high-stakes event in next 4 hours
- **Suppression**: 3-hour minimum gap, skip if app opened in 3 hours, max 1/day, must be only queued notification
- **Copy variants**: SN-1 through SN-4

#### Type 7: Daily Fallback
- **Window**: 10:00 - 12:00 local time
- **Trigger**: No other nudge qualified AND no notification sent today at all
- **Copy variants**: FB-1 through FB-3

### Global Suppression Rules
- **2-hour cooldown**: No new notification if any was sent in the last 2 hours (checked via `notification_log`)
- **DND**: Configurable start/end hours (wraps midnight)
- **Quiet Days**: Array of day-of-week numbers to skip entirely
- **Priority cascade**: When multiple qualify and suppressed, keep highest priority only

### Engagement Tracking (Client-Side)
| Hook | Purpose |
|------|---------|
| `useNotificationEngagement.trackTap(logId)` | Records tap, calculates time_to_engagement_seconds |
| `useNotificationEngagement.trackActionCompleted(logId)` | Records target action completion |
| `useNotificationEngagement.trackDismissed(logId)` | Records dismissal |
| `usePushNotificationHandler` | Routes tapped notification to correct screen via ROUTE_MAP |

### Route Map (Push Tap → Screen)
| notification_type | Route |
|-------------------|-------|
| pre_event_prep | /executive-home |
| pattern_alert | /insights |
| morning_anchor | /daily-check-in |
| afternoon_checkin | /daily-check-in |
| evening_close | /daily-check-in |
| state_aware_nudge | /recalibrate |
| daily_fallback | /daily-check-in |

### Upstream Data Dependencies
| Data Source | Used By | Table |
|-------------|---------|-------|
| Check-in outcome | Pre-Event (tier), Pattern (consecutive low), State-Aware (low trigger) | `daily_checkins` |
| Calendar events | Pre-Event (event scoring), Morning (pressure), Evening (load), State-Aware (afternoon pressure), Pattern (correlation) | `calendar_events` |
| Practice sessions | Pattern (effectiveness milestone) | `practice_sessions` |
| Streak | Morning (variant), Evening (variant), Pattern (streak milestone) | `profiles.current_streak` |
| HRV/Wearable | Evening (HRV variant), Pattern (recovery deficit) | `energy_snapshots` |
| Calendar classifications | Pattern (calendar correlation) | `calendar_event_classifications` |
| App opens | Pattern + State-Aware (suppression) | `user_engagements` |
| Ritual completions | Evening (missing ritual), State-Aware (no afternoon reset) | `daily_ritual_completions` |

---

## Part 2: Bug Diagnosis — Why You Only Get Check-In Nudges

### Evidence from notification_log (last 3 days)

| Type | Count | Notes |
|------|-------|-------|
| morning_anchor | 43 | **Massively over-sent** — should be max 1/day/user |
| evening_close | 35 | Same — all variant ECI-1 (check-in nudge) |
| afternoon_checkin | 34 | Same pattern |
| daily_fallback | 7 | Fires repeatedly (should be max 1/day) |
| pre_event_prep | 1 | Only ever fired once |
| pattern_alert | 0 | Never fired |
| state_aware_nudge | 0 | Never fired |

### Root Cause: The `todayStr` calculation uses LOCAL time but `notification_log` query uses UTC

**Bug Location**: Lines 377-383 in `smart-nudges/index.ts`

```text
todayStr = toDateString(localDate)   // e.g. "2026-03-25" in IST (UTC+5:30)
                                      
notification_log query:
  .gte('sent_at', `${todayStr}T00:00:00`)   // "2026-03-25T00:00:00" — treated as UTC!
```

For a user at UTC+11 (timezone_offset=660), when it's 7:30 AM local on Mar 25, it's 8:30 PM UTC on Mar 24. The query checks `sent_at >= "2026-03-25T00:00:00"` which is the FUTURE in UTC — so `todayLogs` is always empty, and the "already sent today" deduplication NEVER works. This is why:

1. **Morning anchor fires every 15 minutes** instead of once/day — the "already sent morning_anchor today" check always returns empty
2. **2-hour suppression fails** — `lastSentAt` is null because todayLogs is empty
3. **Daily fallback fires repeatedly** — `todayLogs.length === 0` is always true
4. **Pattern alerts never fire** — the 4-hour app_open suppression AND the fact that morning_anchor already fills the queue blocks them
5. **State-aware nudge never fires** — requires `userNotifications.length === 0` but morning_anchor always fires first
6. **Pre-event prep rarely fires** — needs calendar events with high-stakes keywords AND the 30-90 min window to align with a 15-min cron tick

### Secondary Issue: Variant Round-Robin is Broken
All notifications show `variant_id: MA-1`, `AC-1`, `ECI-1` — the round-robin selection reads from `todayLogs` which is always empty, so it always picks the first variant.

### Fix Required

1. **Fix `todayStr` query to use timezone-aware boundaries**: Convert `todayStr` to the correct UTC range for the query:
   ```
   const localMidnightUtc = new Date(localDate);
   localMidnightUtc.setHours(0,0,0,0);
   const utcStart = new Date(localMidnightUtc.getTime() - tzOffset * 60000);
   // Query: .gte('sent_at', utcStart.toISOString())
   ```

2. **Fix the 2-hour suppression** to use all logs, not just "today" logs — a notification sent at 11:55 PM local time should still suppress at 12:05 AM.

3. **Add a separate recent-logs query** (last 4 hours, no date filter) for the suppression check specifically.

### Files to Update

| File | Change |
|------|--------|
| `supabase/functions/smart-nudges/index.ts` | Fix timezone-aware log query; fix 2-hour suppression to query recent logs independently of "today" filter; fix variant round-robin to use recent logs correctly |
| `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` | Create new doc with full system documentation (Part 1 above) |

### Impact
Once fixed:
- Morning/afternoon/evening nudges will fire exactly once per time window per day
- Pattern alerts will start evaluating (consecutive low, effectiveness milestones, etc.)
- State-aware nudges will fire when inner state misaligns with calendar pressure
- Pre-event prep will continue to fire for high-stakes calendar events
- Variant copy will actually rotate instead of always showing the first variant

