# Smart Notifications / Smart Nudges — Technical Documentation

> Last updated: 2026-03-25

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    pg_cron (every 15 min)                │
│              jobid: 4, smart-nudges-every-15m            │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP POST
                        ▼
┌─────────────────────────────────────────────────────────┐
│           Edge Function: smart-nudges/index.ts           │
│                   (verify_jwt=false)                     │
│                                                         │
│  1. Fetch all users with active device tokens           │
│  2. Batch-fetch profiles, preferences, recent engagement│
│  3. Per-user evaluation loop:                           │
│     ┌─ Pre-Event Prep (P1 — highest priority)           │
│     ├─ Pattern Alert (P2)                               │
│     ├─ Morning Anchor (P3)                              │
│     ├─ Afternoon Check-In (P4)                          │
│     ├─ Evening Close (P5)                               │
│     ├─ State-Aware Nudge (P6)                           │
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
│  usePushNotificationHandler → routes to correct screen   │
│  useNotificationEngagement (trackTap/trackDismissed)     │
└─────────────────────────────────────────────────────────┘
```

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_device_tokens` | Active device tokens per user | `user_id, device_token, platform, is_active` |
| `notification_log` | Every notification sent (audit + suppression) | `user_id, notification_type, variant_id, sent_at, event_reference, payload, tapped, app_opened, target_action_completed, dismissed, time_to_engagement_seconds` |
| `notification_preferences` | Per-user toggles + time windows | `morning_anchor_enabled, pre_event_prep_enabled, evening_close_enabled, pattern_alert_enabled, state_aware_nudge_enabled, morning_window_start/end, evening_window_start/end, dnd_start/end, quiet_days[]` |

---

## Timezone Handling

The `profiles.timezone_offset` field stores the user's offset in **minutes** (e.g. IST = 330, EST = -300). This value is synced on every login/app-open via `sync-profile`.

**Log queries use timezone-corrected UTC boundaries:**
```
localMidnightMs = Date.parse(`${todayStr}T00:00:00`)
todayStartUtc   = new Date(localMidnightMs - tzOffset * 60000)
todayEndUtc     = todayStartUtc + 24h
```

This ensures the "already sent today" deduplication is accurate regardless of timezone. A separate recent-logs query (last 2 hours, no date filter) handles suppression independently, preventing midnight-crossover gaps.

---

## Notification Types — Full Logic

### Type 1: Pre-Event Prep (P1 — highest priority)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Trigger** | Calendar event with high-stakes keywords starting in 30–90 min, score ≥ 25 |
| **Data needed** | `calendar_events`, `daily_checkins` (inner tier) |
| **Suppression** | Max 3/day, dedup by `event_reference` (external_id), 2-hour global |
| **Variant selection** | strong/peak → PE-3, depleted/managing → PE-4, else round-robin |
| **Copy variants** | PE-1 through PE-6 |

**High-stakes scoring keywords:** board, investor, presentation, negotiation, pitch, review, performance, strategy, executive, stakeholder, crisis, conflict, termination, layoff, restructure, merger, acquisition, due diligence, fundraise, ipo, media, press, interview, keynote, panel, town hall, all-hands, offsite, retreat, workshop, training. Each match = +25 pts, capped at 100.

### Type 2: Pattern Alert (P2)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Suppression** | Max 1/day, same pattern_type suppressed for 7 days, skip if app opened in last 4 hours |

**5 pattern sub-types (checked in priority order):**

1. **Consecutive Low** — 3 days at depleted/managing → PA-1
2. **Effectiveness Milestone** — 5+ completions of a practice with avg rating ≥ 4.0/5 → PA-2
3. **Streak Milestone** — exactly 7, 14, or 30 days → PA-3
4. **Calendar Correlation** — event type appears on 5+ low-readiness days in 30 days → PA-4
5. **Recovery Deficit** — HRV ≥ 20% below baseline for 3+ consecutive days → PA-5

### Type 3: Morning Anchor (P3)

| Property | Value |
|----------|-------|
| **Window** | `morning_window_start` (default 6) to `morning_window_end - 0.5` (default 8:30) |
| **Trigger** | No daily check-in exists for today |
| **Data needed** | `daily_checkins`, `calendar_events` (count), `profiles.current_streak` |
| **Variant selection** | High calendar pressure → MA-2, streak ≥ 3 → MA-5, else round-robin |
| **Copy variants** | MA-1 through MA-6 |

### Type 4: Afternoon Check-In (P4)

| Property | Value |
|----------|-------|
| **Window** | 12:30 – 14:30 local time |
| **Trigger** | No afternoon check-in (`time_window = 'afternoon'`) exists for today |
| **Copy variants** | AC-1 through AC-3 |

### Type 5: Evening Close (P5)

| Property | Value |
|----------|-------|
| **Window** | `evening_window_start` (default 19) to `evening_window_end - 0.5` (default 21:30) |
| **Trigger** | Evening ritual OR evening check-in missing |
| **Data needed** | `daily_ritual_completions`, `daily_checkins`, `calendar_events`, `energy_snapshots` (HRV) |
| **Variant selection** | Missing check-in → ECI variants, HRV delta ≥ 15% → EC-4, high load → EC-2, streak ≥ 3 → EC-5 |
| **Copy variants** | EC-1 through EC-6, ECI-1, ECI-2 |

### Type 6: State-Aware Nudge (P6)

| Property | Value |
|----------|-------|
| **Window** | 12:00 – 15:00 local time |
| **Trigger** | Morning check-in outcome is depleted/managing AND no afternoon reset completed AND ≥ 1 high-stakes event in next 4 hours |
| **Suppression** | 3-hour minimum gap, skip if app opened in 3 hours, max 1/day, must be only queued notification |
| **Copy variants** | SN-1 through SN-4 |

### Type 7: Daily Fallback (P7)

| Property | Value |
|----------|-------|
| **Window** | 10:00 – 12:00 local time |
| **Trigger** | No other nudge qualified AND no notification sent today at all |
| **Copy variants** | FB-1 through FB-3 |

---

## Global Suppression Rules

| Rule | Logic |
|------|-------|
| **2-hour cooldown** | Separate query for logs in last 2 hours (not date-filtered). Prevents midnight crossover gaps. |
| **DND** | Configurable `dnd_start`/`dnd_end` hours; wraps midnight |
| **Quiet Days** | Array of day-of-week numbers (0=Sun…6=Sat) to skip entirely |
| **Priority cascade** | When multiple qualify and suppressed, keep highest priority only |

---

## Engagement Tracking (Client-Side)

| Hook | File | Purpose |
|------|------|---------|
| `useNotificationEngagement.trackTap(logId)` | `src/hooks/useNotificationEngagement.ts` | Records tap, calculates `time_to_engagement_seconds` |
| `useNotificationEngagement.trackActionCompleted(logId)` | same | Records target action completion |
| `useNotificationEngagement.trackDismissed(logId)` | same | Records dismissal |
| `usePushNotificationHandler` | `src/hooks/usePushNotificationHandler.ts` | Routes tapped notification to correct screen via ROUTE_MAP |

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

---

## Upstream Data Dependencies

| Data Source | Used By | Table |
|-------------|---------|-------|
| Check-in outcome | Pre-Event (tier), Pattern (consecutive low), State-Aware (low trigger) | `daily_checkins` |
| Calendar events | Pre-Event (scoring), Morning (pressure), Evening (load), State-Aware (pressure), Pattern (correlation) | `calendar_events` |
| Practice sessions | Pattern (effectiveness milestone) | `practice_sessions` |
| Streak | Morning (variant), Evening (variant), Pattern (streak milestone) | `profiles.current_streak` |
| HRV/Wearable | Evening (HRV variant), Pattern (recovery deficit) | `energy_snapshots` |
| Calendar classifications | Pattern (calendar correlation) | `calendar_event_classifications` |
| App opens | Pattern + State-Aware (suppression) | `user_engagements` |
| Ritual completions | Evening (missing ritual), State-Aware (no afternoon reset) | `daily_ritual_completions` |

---

## Downstream Clients

| Component | File | Usage |
|-----------|------|-------|
| `SmartNudge` | `src/components/SmartNudge.tsx` | In-app nudge card UI |
| `SmartNudgeNotification` | `src/components/SmartNudgeNotification.tsx` | Lock-screen style in-app notification |
| `PushNotificationProvider` | `src/components/PushNotificationProvider.tsx` | Registers device token |
| `useDeviceTokenRegistration` | `src/hooks/useDeviceTokenRegistration.ts` | Persists token to `notification_device_tokens` |

---

## Variant Round-Robin Logic

The `selectVariant()` function picks the next variant in sequence based on the last variant sent for that type (read from `todayLogs`). If no previous variant exists, it defaults to the first variant. Context-specific overrides (calendar pressure, streak, inner tier, HRV delta) take precedence over round-robin.

---

## APNs Configuration

| Secret | Purpose |
|--------|---------|
| `APNS_P8_KEY` | ECDSA P-256 private key for JWT signing |
| `APNS_KEY_ID` | Key identifier from Apple |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_ENVIRONMENT` | `production` or `development` (controls APNs host) |

**Bundle ID:** `com.moonshot.mindmoduleapp`

If any APNs secret is missing, the function runs in **dry-run mode** — logs are created but no push is sent.

---

## Cron Schedule

```sql
-- pg_cron job (jobid: 4)
SELECT cron.schedule(
  'smart-nudges-every-15m',
  '*/15 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-25 | Fixed timezone bug: `todayStr` log query now uses UTC-corrected boundaries. Added separate 2-hour suppression query independent of date filter. This fixes duplicate notifications and enables Pattern Alert / State-Aware nudges to fire correctly. |
