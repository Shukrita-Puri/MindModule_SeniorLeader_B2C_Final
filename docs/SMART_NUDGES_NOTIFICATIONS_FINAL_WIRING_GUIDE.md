# Smart Nudges / Notifications - Final Wiring Guide

Use this guide when adding or repairing notification files. It is the shorter implementation companion to `docs/SMART_NUDGES_NOTIFICATIONS_FINAL_SSOT.md`.

---

## 1. Start Here

Before editing, read:

- `supabase/functions/smart-nudges/index.ts`
- `supabase/functions/register-device-token/index.ts`
- `supabase/functions/notification-engagement/index.ts`
- `supabase/functions/notification-receipt/index.ts`
- `src/hooks/useDeviceTokenRegistration.ts`
- `src/hooks/usePushNotificationHandler.ts`
- `src/pages/NudgeSettings.tsx`

Then search migrations for:

```text
notification_device_tokens
notification_preferences
notification_log
notification_evaluator_runs
notification_evaluator_traces
smart-nudges
cron.schedule
```

---

## 2. Correct Wiring Shape

```text
Native iOS app
  |
  | PushNotifications registration
  v
useDeviceTokenRegistration
  |
  | Auth0 token + normalized APNs token
  v
register-device-token
  |
  | service-role upsert/deactivate
  v
notification_device_tokens

pg_cron / manual force
  |
  v
smart-nudges
  |
  | reads tokens, prefs, profile, engagement, calendar, snapshots, plan/JIT,
  | travel, Brief behaviour, wearable/check-in/context signals
  v
notification_evaluator_runs + notification_evaluator_traces
  |
  | qualified send/dry-run/suppression
  v
notification_log
  |
  | APNs send if not dry-run
  v
Apple APNs
  |
  | tap / receipt
  v
usePushNotificationHandler -> notification-engagement / notification-receipt
```

---

## 3. Do Not Duplicate

Do not create duplicates for:

- APNs token storage;
- APNs send logic;
- notification preferences;
- notification logs;
- evaluator traces;
- calendar merge;
- event taxonomy;
- travel detection;
- Brief behaviour snapshot loading;
- forbidden notification words;
- week-ahead invite logic.

If you need shared behaviour, add or use a `_shared` helper and import it.

---

## 4. Backend Wiring Rules

### `smart-nudges`

Keep it as the only evaluator.

Required behaviours:

- writes `notification_evaluator_runs`;
- writes `notification_evaluator_traces`;
- reads active tokens;
- respects preferences;
- enforces global local window;
- enforces app-open cooldown;
- enforces daily cap;
- does not count `dry_run`, `suppressed`, `failed`, or expired rows toward the daily cap;
- writes `notification_log`;
- validates copy before APNs;
- records APNs status/reason;
- deactivates permanently bad tokens.

### `register-device-token`

Required behaviours:

- authenticate request;
- use Auth0 user id as `user_id`;
- validate iOS token as 64/72/128 hex;
- deactivate other tokens for same user/platform;
- upsert current token as active;
- prune inactive stale tokens.

### `notification-engagement`

Required behaviours:

- authenticate request;
- require `notification_log_id`;
- require action in `tap`, `action_completed`, `dismissed`;
- verify row belongs to authenticated user;
- update engagement fields only for that row.

### `notification-receipt`

Required behaviours:

- accept `notification_log_id`;
- mark row delivered unless failed/expired;
- stamp `delivered_at`;
- remain compatible with iOS notification extension / best-effort tap fallback.

---

## 5. Frontend Wiring Rules

### `useDeviceTokenRegistration`

Keep:

- native platform guard;
- authenticated user guard;
- permission check/request;
- APNs token normalization;
- invalid token rejection;
- call to `register-device-token`;
- telemetry;
- owned-listener cleanup only.

Do not clear all push listeners globally.

### `usePushNotificationHandler`

Keep:

- native platform guard;
- authenticated user guard;
- `pushNotificationActionPerformed`;
- `deep_link_route` priority;
- `notification_log_id` tracking;
- receipt fallback;
- legacy route fallback map.

### `NudgeSettings`

Keep settings mapped to `notification_preferences`.

Do not wire Smart Nudge settings to `user_preferences`; that edge function is a separate generic preference endpoint.

---

## 6. Live Verification Script

Use this sequence before declaring deployed notifications correct:

1. Confirm deployed edge functions:
   - `smart-nudges`
   - `register-device-token`
   - `notification-engagement`
   - `notification-receipt`
   - `test-push`

2. Confirm secrets exist without printing values:
   - `APNS_P8_KEY`
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_BUNDLE_ID`
   - `APNS_ENVIRONMENT`

3. Confirm cron:
   - job calls `/functions/v1/smart-nudges`;
   - job is not duplicated;
   - Authorization uses service role;
   - schedule frequency is intentional.

4. Run diagnostic:

```text
/functions/v1/smart-nudges?diagnostic=1
```

5. Run forced dry-run for one internal user:

```text
/functions/v1/smart-nudges?force_user=<USER_ID>&force_dry=1
```

6. Verify database evidence:
   - `notification_evaluator_runs` row exists;
   - `notification_evaluator_traces` rows exist;
   - suppression reasons are clear;
   - `notification_log` row exists only if a nudge qualified;
   - no APNs delivery happened during dry-run.

7. Optional approved live push:

```text
/functions/v1/smart-nudges?force_user=<USER_ID>
```

Verify:

- active token exists;
- APNs host matches build environment;
- APNs result is recorded;
- `delivery_state='accepted'` after APNs 200;
- tap marks delivered/tapped/app_opened;
- route opens correctly.

---

## 7. Red Flags

Stop and fix if you see:

- a new notification table instead of `notification_log`;
- a new token table instead of `notification_device_tokens`;
- notification settings stored only in `user_preferences`;
- hardcoded user ids;
- UUID assumptions for Auth0 text user ids;
- APNs secrets logged;
- unsupported token lengths accepted;
- `dry_run` rows counted against daily cap;
- suppressed rows counted against daily cap;
- generic unanchored copy;
- duplicate week-ahead invite sends in the same ISO week;
- notification tap does not update engagement;
- `PushNotifications.removeAllListeners()` inside token registration.

