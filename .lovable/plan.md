

# Smart Nudges Edge Function -- Implementation Plan

## Overview

Build a new `smart-nudges` edge function that evaluates all active users every 15 minutes and determines which notifications to send. This is the server-side intelligence layer. The function outputs notification payloads that will be delivered via Firebase Cloud Messaging (FCM) once the Capacitor mobile wrapper is connected.

Phase 1 covers three notification types: **Morning Anchor**, **Pre-Event Prep**, and **Evening Close**.

---

## Database Changes

### New table: `notification_device_tokens`

Stores FCM device tokens registered from the mobile app.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | text | NOT NULL |
| device_token | text | NOT NULL, FCM token |
| platform | text | 'ios' or 'android' |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: Service role only (edge function manages tokens). Users can insert/view their own.

### New table: `notification_log`

Records every notification sent, for analytics and suppression logic.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | text | NOT NULL |
| notification_type | text | morning_anchor, pre_event_prep, evening_close, pattern_alert, state_aware_nudge |
| variant_id | text | e.g. MA-1, PE-3, EC-4 |
| sent_at | timestamptz | default now() |
| event_reference | text | nullable -- calendar event ID if pre-event |
| payload | jsonb | full notification content sent |
| tapped | boolean | default false |
| app_opened | boolean | default false |
| target_action_completed | boolean | default false |
| dismissed | boolean | default false |
| time_to_engagement_seconds | integer | nullable |

RLS: Service role can manage all. Users can view/update their own (for client-side engagement tracking).

### New table: `notification_preferences`

User-level notification settings.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | text | NOT NULL, unique |
| morning_anchor_enabled | boolean | default true |
| pre_event_prep_enabled | boolean | default true |
| evening_close_enabled | boolean | default true |
| pattern_alert_enabled | boolean | default true |
| state_aware_nudge_enabled | boolean | default true |
| morning_window_start | integer | hour, default 6 |
| morning_window_end | integer | hour, default 9 (8:30 rounded) |
| evening_window_start | integer | hour, default 19 |
| evening_window_end | integer | hour, default 22 (9:30 rounded) |
| dnd_start | integer | nullable, hour |
| dnd_end | integer | nullable, hour |
| quiet_days | integer[] | nullable, day-of-week numbers (0=Sun) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: Service role can manage all. Users can view/update their own.

### Alter table: `profiles`

Add `timezone_offset` (integer, nullable) -- minutes offset from UTC, updated each time the client calls an edge function that passes `timezoneOffset`.

---

## Edge Function: `smart-nudges`

### Architecture

This is a **scheduled function** (called via pg_cron every 15 minutes). No user auth required -- it uses the service role key to iterate all users.

### Core Logic Flow

```text
1. Fetch all users who have active device tokens
2. For each user:
   a. Calculate user's local time from timezone_offset
   b. Check DND / quiet days -- skip if blocked
   c. Check what notifications were already sent today (from notification_log)
   d. Evaluate each notification type in priority order:
      - Pre-Event Prep (highest priority)
      - Morning Anchor
      - Evening Close
   e. Apply suppression rules (no 2 notifications within 2 hours)
   f. Select copy variant (round-robin or random for A/B testing)
   g. Queue qualified notifications
3. Send all queued notifications via FCM
4. Log each sent notification to notification_log
```

### Trigger Logic Per Type

**Morning Anchor:**
- Local time is within user's morning window (default 6:00-8:30)
- User has NOT completed today's check-in (query `daily_checkins`)
- No morning_anchor already sent today (query `notification_log`)
- Select variant based on: calendar pressure (from `calendar_events`), streak count (from `profiles.current_streak`), day of week

**Pre-Event Prep:**
- Query `calendar_events` for events starting in 30-90 minutes
- Score events using same keyword matching as `generate-mastery-plan` (board, investor, presentation, negotiation, etc.)
- Event priority score >= 50
- Not already sent for this specific event today
- Max 3 per day
- Select variant based on: inner readiness tier (from latest `daily_checkins`), calendar load

**Evening Close:**
- Local time is within user's evening window (default 19:00-21:30)
- User has NOT completed evening practice today (query `daily_ritual_completions`)
- No evening_close already sent today
- Select variant based on: calendar load for the day, streak, HRV delta (from `energy_snapshots` if wearable connected)

### FCM Integration

The function will call FCM HTTP v1 API to send push notifications. This requires a Firebase service account key stored as a secret.

**New secret required:** `FCM_SERVICE_ACCOUNT_JSON` -- Firebase service account credentials for sending push notifications.

Note: This will not be set up until the Capacitor mobile wrapper is ready. Until then, the edge function will log notifications that *would* have been sent to `notification_log` with a `dry_run: true` flag in the payload, allowing testing of the trigger logic without actual push delivery.

### Copy Variant Selection

Each notification type has 6 variants. The function selects variants using a simple rotation strategy:
- Track which variant was last used per user per type in the notification_log
- Rotate through variants sequentially
- This ensures each variant gets roughly equal exposure for A/B comparison

---

## Client-Side Changes

### 1. Update `NudgeSettings.tsx`

Connect the settings page to the `notification_preferences` table via the existing `user-preferences` edge function (or a new action in it). Currently the page uses local state only -- wire it to persist preferences.

### 2. New hook: `useNotificationEngagement.ts`

When the app opens from a push notification deep link, log engagement data back to `notification_log`:
- `tapped = true`
- `time_to_engagement_seconds` = seconds since `sent_at`
- Track `target_action_completed` when the user completes the intended action (check-in, practice, tiny win)

### 3. Device token registration

Add a utility that registers the FCM device token on app launch (Capacitor-only) by inserting into `notification_device_tokens`. This will be activated when the Capacitor wrapper is built.

---

## Files Created/Modified

| File | Action |
|---|---|
| `supabase/functions/smart-nudges/index.ts` | **New** -- Core notification evaluation engine |
| `supabase/config.toml` | Add `[functions.smart-nudges]` with `verify_jwt = false` |
| Database migration | Create 3 new tables + alter profiles |
| `src/pages/NudgeSettings.tsx` | Wire to `notification_preferences` table |
| `src/hooks/useNotificationEngagement.ts` | **New** -- Track notification engagement |

---

## What Is NOT Built Yet (Phase 2)

- Pattern Alert (Type 4) and State-Aware Nudge (Type 5) -- activated later as user accumulates data
- Actual FCM send -- requires Firebase project setup and `FCM_SERVICE_ACCOUNT_JSON` secret
- Capacitor push notification plugin integration (`@capacitor/push-notifications`)
- pg_cron job scheduling (will be set up when FCM is ready)
- Internal analytics dashboard for variant performance

---

## Summary

This plan builds the complete server-side intelligence engine for Smart Nudges with all trigger logic, copy variants, suppression rules, and analytics instrumentation. It operates in "dry run" mode (logging what would send) until the Firebase/Capacitor mobile infrastructure is connected. The three Phase 1 notification types (Morning Anchor, Pre-Event Prep, Evening Close) cover the daily habit anchors and just-in-time calendar preparation.

