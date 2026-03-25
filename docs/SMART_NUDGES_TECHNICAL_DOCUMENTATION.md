# Smart Notifications / Smart Nudges — Technical Documentation

> Last updated: 2026-03-25

---

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
│     a. DND / Quiet Day / Daily Cap check                │
│     b. Engagement profile + type diversity lookup       │
│     c. Priority cascade evaluation (7 types)            │
│     d. Diversity-aware sort with engagement weighting   │
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
| `notification_log` | Every notification sent (audit + suppression + engagement) | `user_id, notification_type, variant_id, sent_at, event_reference, payload, tapped, app_opened, target_action_completed, dismissed, time_to_engagement_seconds` |
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

## Daily Global Cap

**Maximum 3 notifications per user per day.** After fetching `todayLogs`, the system checks:

```
if (todayLogs.length >= 3) → skip user entirely
```

This hard-caps total notifications regardless of how many types qualify. The cap prevents notification fatigue while still allowing a healthy mix of morning + evening + one contextual nudge (e.g. pre-event or pattern alert).

---

## Notification Types — Full Logic

**Weekday Priority Order (highest → lowest):**
1. Pre-Event Prep (P1)
2. Pattern Alert (P2)
3. Morning Anchor (P3)
4. State-Aware Nudge (P4)
5. Evening Close (P5)
6. Afternoon Check-In (P6)
7. Daily Fallback (P7)

### Type 1: Pre-Event Prep (P1 — highest priority)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Trigger** | Calendar event with high-stakes keywords starting in 30–90 min, score ≥ 25 |
| **Data needed** | `calendar_events`, `daily_checkins` (inner tier) |
| **Suppression** | Max 3/day, dedup by `event_reference` (external_id), 2-hour global |
| **Weekend** | Active (high-stakes events can happen on weekends) |
| **Engagement learning** | Subject to 50% reduction if 0 taps in 5+ sends over 7 days |
| **Variant selection** | strong/peak → PE-3, depleted/managing → PE-4, else round-robin |
| **Copy variants** | PE-1 through PE-6 |

**High-stakes scoring keywords:** board, investor, presentation, negotiation, pitch, review, performance, strategy, executive, stakeholder, crisis, conflict, termination, layoff, restructure, merger, acquisition, due diligence, fundraise, ipo, media, press, interview, keynote, panel, town hall, all-hands, offsite, retreat, workshop, training. Each match = +25 pts, capped at 100.

### Type 2: Pattern Alert (P2)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Weekend** | Active (patterns don't pause for weekends) |
| **Suppression** | Max 1/day, same pattern_type suppressed for 7 days, skip if app opened in last 4 hours |
| **Engagement learning** | Subject to 50% reduction if ineffective |

**5 pattern sub-types (checked in priority order):**

1. **Consecutive Low** — 3 days at depleted/managing → PA-1
2. **Effectiveness Milestone** — 5+ completions of a practice with avg rating ≥ 4.0/5 → PA-2
3. **Streak Milestone** — exactly 7, 14, or 30 days → PA-3
4. **Calendar Correlation** — event type appears on 5+ low-readiness days in 30 days → PA-4
5. **Recovery Deficit** — HRV ≥ 20% below baseline for 3+ consecutive days → PA-5

### Type 3: Morning Anchor (P3)

| Property | Value |
|----------|-------|
| **Window (weekday)** | `morning_window_start` (default 6) to `morning_window_end - 0.5` (default 8:30) |
| **Window (Saturday)** | 7:30 to 10:00 (shifted later) |
| **Window (Sunday)** | 8:00 to 10:30 (shifted later) |
| **Trigger** | No daily check-in exists for today |
| **Data needed** | `daily_checkins`, `calendar_events` (count), `profiles.current_streak` |
| **Weekend variants** | Used when calendar pressure is not high: MA-W1, MA-W2 |
| **Weekday variant selection** | High calendar pressure → MA-2, streak ≥ 3 → MA-5, else round-robin |
| **Copy variants** | Weekday: MA-1 through MA-6 · Weekend: MA-W1, MA-W2 |

### Type 4: State-Aware Nudge (P4)

| Property | Value |
|----------|-------|
| **Window** | 12:00 – 15:00 local time |
| **Trigger** | Morning check-in outcome is depleted/managing AND no afternoon reset completed AND ≥ 1 high-stakes event in next 4 hours |
| **Weekend** | **DISABLED** — requires structured calendar pressure |
| **Suppression** | 3-hour minimum gap, skip if app opened in 3 hours, max 1/day, must be only queued notification |
| **Copy variants** | SN-1 through SN-4 |

### Type 5: Evening Close (P5)

| Property | Value |
|----------|-------|
| **Window (weekday)** | `evening_window_start` (default 19) to `evening_window_end - 0.5` (default 21:30) |
| **Window (Sunday)** | Extended to 22:00 for week-prep nudge |
| **Trigger** | Evening ritual OR evening check-in missing |
| **Data needed** | `daily_ritual_completions`, `daily_checkins`, `calendar_events`, `energy_snapshots` (HRV) |

**Weekend-specific evening variants:**

| Day | Variants | Copy |
|-----|----------|------|
| **Friday** (dayOfWeek=5) | EC-F1, EC-F2 | "Week complete. What are you carrying into the weekend?" / "Five days behind you. Close the week before you unplug." |
| **Saturday** (dayOfWeek=6) | EC-W1 | "No agenda tonight. Just notice how you're landing." |
| **Sunday** (dayOfWeek=0) | EC-S1, EC-S2 | "Monday is mapped. Set your intention before the week begins." / "Sunday close. What do you want to carry into the new week?" |
| **Weekday (missing check-in)** | ECI-1, ECI-2 | Standard evening check-in copy |
| **Weekday (missing ritual)** | EC-1 through EC-6 | Context-aware: HRV delta ≥ 15% → EC-4, high calendar load → EC-2, streak ≥ 3 → EC-5 |

### Type 6: Afternoon Check-In (P6)

| Property | Value |
|----------|-------|
| **Window** | 12:30 – 14:30 local time |
| **Trigger** | No afternoon check-in (`time_window = 'afternoon'`) exists for today |
| **Weekend** | **DISABLED** — skipped on Saturday and Sunday |
| **Copy variants** | AC-1 through AC-3 |

### Type 7: Daily Fallback (P7)

| Property | Value |
|----------|-------|
| **Window** | 10:00 – 12:00 local time |
| **Trigger** | No other nudge qualified AND no notification sent today at all |
| **Weekend** | Active (ensures minimum 1 touch/day) |
| **Copy variants** | FB-1 through FB-3 |

---

## Weekend Rules Summary

| Rule | Weekday | Saturday | Sunday | Friday |
|------|---------|----------|--------|--------|
| Morning window | 6:00–8:30 | 7:30–10:00 | 8:00–10:30 | Standard |
| Morning variants | MA-1 to MA-6 | MA-W1, MA-W2 | MA-W1, MA-W2 | Standard |
| Afternoon check-in | ✅ Active | ❌ Disabled | ❌ Disabled | ✅ Active |
| Evening variants | EC/ECI standard | EC-W1 | EC-S1, EC-S2 | EC-F1, EC-F2 |
| Evening window | Standard | Standard | Extended to 22:00 | Standard |
| State-Aware nudge | ✅ Active | ❌ Disabled | ❌ Disabled | ✅ Active |
| Pre-Event prep | ✅ Active | ✅ Active | ✅ Active | ✅ Active |
| Pattern Alert | ✅ Active | ✅ Active | ✅ Active | ✅ Active |
| Daily Fallback | ✅ Active | ✅ Active | ✅ Active | ✅ Active |

---

## Global Suppression Rules

| Rule | Logic |
|------|-------|
| **Daily cap** | Max 3 notifications per user per day across all types |
| **2-hour cooldown** | Separate query for logs in last 2 hours (not date-filtered). Prevents midnight crossover gaps. |
| **DND** | Configurable `dnd_start`/`dnd_end` hours; wraps midnight |
| **Quiet Days** | Array of day-of-week numbers (0=Sun…6=Sat) to skip entirely. Schema supports it; no defaults set. User-configurable in NudgeSettings. |
| **Priority cascade** | When multiple qualify and suppressed, keep highest priority only (determined by time-of-day priority) |

---

## Type Diversity Guarantee

The system ensures users see a variety of notification types, not just the same ones daily.

### 3-Day Lookback
Before evaluating notifications, the system fetches the last 3 days of `notification_log` grouped by `notification_type` to build a **type frequency map**.

### Diversity-Aware Sorting
When multiple notification types qualify in the same evaluation cycle:

1. **Pre-Event always wins** — time-critical, never deprioritized
2. **Unseen types get a boost** — types not sent in 3+ days receive a `-10` priority score boost (higher priority)
3. **Effective types get a boost** — types with >50% tap rate over 14 days receive a `-5` priority score boost
4. **Time-of-day context** — base priority shifts by time window (see below)

This ensures that if Pattern Alert and Morning Anchor both qualify, the one the user hasn't seen recently gets preference.

---

## Engagement-Based Learning

The system learns from user behavior using data already captured in `notification_log`.

### 14-Day Feedback Loop

The `getUserEngagementProfile()` function queries the last 14 days of notifications and calculates:

| Metric | Calculation |
|--------|-------------|
| **Per-type tap rate** | `tapped_count / sent_count` for each `notification_type` |
| **Suppressed types** | Types sent 5+ times with 0 taps → marked for 50% reduction |

### How Suppression Works

- Types in the `suppressedTypes` list are **not fully disabled** — they fire on ~50% of qualifying occasions
- Suppression uses a deterministic hash (`userId + type + todayStr`) so it's consistent within a day but varies across days
- The `suppression_note` field in the payload logs when engagement suppression is applied, enabling debugging

### What the System Does NOT Do (by design)

- Does not fully disable any notification type (always allows 50% through to detect recovery)
- Does not adjust timing windows based on tap timing (planned for Phase 3)
- Does not cross-reference across users (per-user only)

---

## Time-of-Day Priority Shifting

Priority is **not static** — it shifts based on the user's current local time to match contextual relevance.

| Time Window | Priority Order (highest → lowest) |
|-------------|-----------------------------------|
| **Morning (6–11)** | Morning Anchor → Pre-Event → Pattern Alert → Afternoon → Evening → State-Aware → Fallback |
| **Midday (11–15)** | Pre-Event → State-Aware → Afternoon → Pattern Alert → Morning → Evening → Fallback |
| **Evening (18–22)** | Evening Close → Pattern Alert → Pre-Event → State-Aware → Morning → Afternoon → Fallback |
| **Other (15–18, 22+)** | Pre-Event → Pattern Alert → Fallback → Morning → Afternoon → Evening → State-Aware |

**Exception:** Pre-Event Prep always wins within its 30–90 min trigger window regardless of time-of-day priority, because it is inherently time-critical.

---

## Variant Round-Robin Logic

The `selectVariant()` function picks the next variant in sequence based on the last variant sent for that type (read from `todayLogs`). If no previous variant exists, it defaults to the first variant. Context-specific overrides (calendar pressure, streak, inner tier, HRV delta, weekend) take precedence over round-robin.

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
| Notification engagement | Engagement learning (tap rates, suppression) | `notification_log.tapped, .dismissed` |

---

## Downstream Clients

| Component | File | Usage |
|-----------|------|-------|
| `SmartNudge` | `src/components/SmartNudge.tsx` | In-app nudge card UI |
| `SmartNudgeNotification` | `src/components/SmartNudgeNotification.tsx` | Lock-screen style in-app notification |
| `PushNotificationProvider` | `src/components/PushNotificationProvider.tsx` | Registers device token |
| `useDeviceTokenRegistration` | `src/hooks/useDeviceTokenRegistration.ts` | Persists token to `notification_device_tokens` |

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
| 2026-03-25 | **Major enhancement:** Added daily global cap (max 3/day), weekend-aware morning/evening variants (Fri/Sat/Sun), disabled afternoon check-in and state-aware nudge on weekends, shifted weekend morning windows (Sat 7:30–10, Sun 8–10:30), extended Sunday evening window. Added engagement-based learning (14-day tap rate analysis, 50% suppression of ineffective types). Added type diversity guarantee (3-day lookback, least-recently-sent boost). Added time-of-day priority shifting (dynamic priority based on morning/midday/evening). |
| 2026-03-25 | Fixed timezone bug: `todayStr` log query now uses UTC-corrected boundaries. Added separate 2-hour suppression query independent of date filter. This fixes duplicate notifications and enables Pattern Alert / State-Aware nudges to fire correctly. |
