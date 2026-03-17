

# Smart Nudges System — Full Audit & Documentation

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                     CRON TRIGGER                         │
│  pg_cron: */15 * * * * (every 15 min)                   │
│  → net.http_post → smart-nudges edge function            │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              smart-nudges Edge Function                   │
│                                                          │
│  UPSTREAM DATA SOURCES (reads from):                     │
│  1. notification_device_tokens (active iOS tokens)       │
│  2. profiles (streak, timezone_offset)                   │
│  3. notification_preferences (DND, windows, toggles)     │
│  4. user_engagements (app_open for suppression)          │
│  5. notification_log (today's sent history)              │
│  6. calendar_events (upcoming high-stakes events)        │
│  7. daily_checkins (inner readiness tier)                │
│  8. daily_ritual_completions (evening/afternoon done?)   │
│  9. energy_snapshots (HRV delta)                         │
│  10. practice_sessions (effectiveness ratings)           │
│  11. sanctuary_content (practice names)                  │
│  12. calendar_event_classifications (correlation)        │
│  13. coach_pattern_observations (indirectly via alerts)  │
│                                                          │
│  DOWNSTREAM (writes to):                                 │
│  1. notification_log (every sent/dry-run notification)   │
│  2. APNs (api.push.apple.com) — live delivery            │
└─────────────────────────────────────────────────────────┘
```

## Notification Types & Priority Cascade

| Priority | Type              | Time Window (local) | Trigger Condition                                                        | Max/Day | Suppression     |
|----------|-------------------|---------------------|--------------------------------------------------------------------------|---------|-----------------|
| P1       | pre_event_prep    | Anytime             | Calendar event scoring ≥50 (high-stakes keywords) starting in 30-90 min | 3       | 2h between any  |
| P2       | pattern_alert     | Anytime             | 5 sub-patterns (consecutive low, effectiveness, streak, calendar corr., HRV deficit) | 1 | 7d per pattern type + 4h app-open |
| P3       | morning_anchor    | 6:00-8:30 (default) | No daily check-in completed today                                        | 1       | 2h between any  |
| P4       | evening_close     | 19:00-21:30 (default)| No evening ritual completed today                                       | 1       | 2h between any  |
| P5       | state_aware_nudge | 12:00-15:00         | Morning check-in = depleted/managing + no afternoon reset + 3+ high-stakes events in next 4h | 1 | 3h + 3h app-open |

## Copy Variants Per Type

- **Morning Anchor**: 6 variants (MA-1 through MA-6), context-selected by calendar pressure, streak
- **Pre-Event Prep**: 6 variants (PE-1 through PE-6), selected by inner readiness tier
- **Evening Close**: 6 variants (EC-1 through EC-6), selected by HRV delta, calendar load, streak
- **Pattern Alert**: 5 variants (PA-1 through PA-5), one per sub-pattern
- **State-Aware Nudge**: 4 variants (SN-1 through SN-4), selected by event proximity

## Client-Side Infrastructure

| Component                       | Role                                                    |
|---------------------------------|---------------------------------------------------------|
| `useDeviceTokenRegistration.ts` | Requests iOS permission, registers token via `register-device-token` edge function |
| `usePushNotificationHandler.ts` | Intercepts taps → routes to correct screen via ROUTE_MAP |
| `useNotificationEngagement.ts`  | Tracks tap engagement metrics                           |
| `AppDelegate.swift`             | Native APNs registration + foreground banner display    |
| `App.entitlements`              | `aps-environment: development` (overridden by TestFlight to production) |

## Tap-to-Screen Routing

| notification_type    | Destination        |
|----------------------|--------------------|
| pre_event_prep       | /executive-home    |
| pattern_alert        | /insights          |
| morning_anchor       | /daily-check-in    |
| evening_close        | /executive-home    |
| state_aware_nudge    | /recalibrate       |

---

# CRITICAL BUGS & GAPS

### BUG 1 (CRITICAL): `timezone_offset` is NULL for all users — notifications never fire at the right time

**Both active users have `timezone_offset: NULL` in the profiles table.** The code defaults to `0` (UTC):
```
const tzOffset = profile?.timezone_offset ?? 0;
```

If you're in IST (UTC+5:30), the system thinks your local time is UTC. This means:
- **Morning Anchor (6-8:30)**: Only evaluates when UTC = 6-8:30 (i.e., 11:30 AM - 2 PM IST) — by which time you've already checked in
- **Evening Close (19-21:30)**: Only evaluates when UTC = 19-21:30 (i.e., 12:30 AM - 3 AM IST) — you're asleep
- **State-Aware (12-15)**: Only evaluates when UTC = 12-15 (i.e., 5:30 PM - 8:30 PM IST) — wrong window

**This is the #1 reason you're not receiving notifications.** The timezone_offset is never being set.

### BUG 2 (HIGH): `notification_log` table is always empty — suppression logic works, but no notifications have EVER been logged

The table is empty, confirming the engine has never qualified a single notification for delivery.

### BUG 3 (MODERATE): Cron responses show `status_code: NULL` for smart-nudges

Every other 15-min execution (IDs 872, 870, 868, 866) returns `NULL` status_code and `NULL` content from `net._http_response`. This suggests intermittent timeout or the function sometimes doesn't return before `pg_net` gives up. The function does work when invoked directly (200 OK, ~2s), so this may be a `pg_net` timeout configuration issue, though it's secondary since the function returns 0 notifications anyway.

### BUG 4 (MODERATE): `current_streak` is 0 for both users

Streak-based variant selection (MA-5 for streaks ≥3, EC-5 for streaks ≥3, PA-3 for streak milestones) will never activate. The streak counter may not be getting updated.

### BUG 5 (LOW): Pre-Event Prep requires event score ≥ 50 (2+ keyword matches)

The `scoreEvent()` function gives 25 points per keyword match and requires ≥50 to qualify. A meeting titled "Board Review" (2 keywords) qualifies, but "Team Standup" (0 keywords) doesn't. Regular meetings will never trigger pre-event prep.

### BUG 6 (LOW): Pattern Alert conditions are very strict

- Consecutive low: Requires 3 consecutive days with outcome = "depleted" or "managing" — your recent outcomes are "focused", "steady", "scattered" (none qualify)
- Effectiveness milestone: Requires 5+ completed practice sessions with avg rating ≥4.0/5
- Streak milestone: Requires current_streak exactly = 7, 14, or 30 (current = 0)
- Calendar correlation: Requires 5+ low-readiness days correlated with same event type in 30 days
- Recovery deficit: Requires 3 consecutive days with HRV ≥20% below baseline

### GAP 1: No `notification_preferences` rows exist

The preferences table is empty. All defaults kick in (all types enabled, morning 6-9, evening 19-22, no DND, no quiet days). This isn't necessarily a bug but means user-customizable windows aren't being used.

### GAP 2: `useDeviceTokenRegistration` uses `window.__auth0Client?.getAccessTokenSilently()`

This is Auth0-specific and works, but the token is sent to `register-device-token` which verifies via Auth0 userinfo endpoint. If Auth0 rate-limits or the token is stale, registration silently fails.

### GAP 3: State-Aware Nudge requires 3+ HIGH-STAKES afternoon events

The threshold of 3+ events scoring ≥50 in the next 4 hours is extremely strict. Most executives won't have 3 board/investor/keynote meetings in a single afternoon.

---

# Fix Plan

### Fix 1: Populate `timezone_offset` for existing users (IMMEDIATE)
- Update profiles table with correct timezone offsets for both active users
- Ensure the client-side code is sending timezone_offset during profile sync

### Fix 2: Add timezone_offset to profile sync flow
- Modify the `sync-profile` edge function (or client code) to capture and persist `new Date().getTimezoneOffset()` on every login/app open

### Fix 3: Lower State-Aware Nudge threshold
- Reduce from 3+ high-stakes events to 1+ high-stakes event, or include medium-scoring events

### Fix 4: Investigate streak counter
- Verify the streak update logic is running and incrementing correctly

### Fix 5: Add fallback notification
- If no nudge type qualifies for a user across an entire day, send a gentle "check in" reminder to ensure at least 1 touch per day

