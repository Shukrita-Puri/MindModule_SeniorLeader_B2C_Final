# Smart Nudges / Notifications - Final SSOT

**Status:** code-level build source of truth  
**Created:** 2026-06-30  
**Primary runtime:** `supabase/functions/smart-nudges/index.ts`  
**Primary tables:** `notification_device_tokens`, `notification_preferences`, `notification_log`, `notification_evaluator_runs`, `notification_evaluator_traces`  
**Frontend entry points:** `useDeviceTokenRegistration`, `usePushNotificationHandler`, `NudgeSettings`

This document is the practical source of truth for building or repairing Smart Nudges and push notifications in this workspace. It is based on the live code, not the older architecture notes.

When this document conflicts with older docs, treat this file as the current implementation guide and then verify against the live source files before editing.

---

## 1. What This System Is

Smart Nudges is the production push notification evaluator for Mind Module. It runs from the `smart-nudges` Supabase Edge Function, evaluates eligible users, applies delivery guards, writes durable audit rows, and sends APNs pushes.

It is not a UI card system. It is not a second Brief or Plan generator. It is a delivery layer that consumes the same executive context, calendar, travel, behaviour, and copy rules used by Brief / Plan / Executive Home.

The system has five jobs:

1. Keep a current active APNs token for each authenticated native iOS user.
2. Evaluate whether the user deserves a nudge at the current local moment.
3. Suppress aggressively when the notification would be stale, noisy, duplicative, or outside user preferences.
4. Send via APNs only after copy, timing, cap, and token checks pass.
5. Persist enough logs and traces to prove what happened.

---

## 2. Non-Negotiable Architecture

### 2.1 Central Evaluator

`supabase/functions/smart-nudges/index.ts` is the central evaluator.

Do not create:

- a second smart nudge edge function,
- a parallel notification scheduler,
- a duplicate calendar classifier,
- a duplicate APNs sender,
- a duplicate delivery log table,
- a duplicate copy vocabulary,
- a duplicate user preference table.

Small helper files are fine only when they keep the same contracts and are imported by the central evaluator.

### 2.2 Shared Logic Ownership

Smart Nudges must consume existing shared modules:

| Concern | Source |
|---|---|
| Brief behaviour snapshot | `supabase/functions/_shared/load-brief-behaviour-snapshot.ts` |
| Behaviour wiring fallback | `supabase/functions/_shared/behaviour-wiring.ts` |
| Calendar merge | `supabase/functions/_shared/rules/calendar-merge.ts` |
| Executive event taxonomy | shared executive taxonomy imports inside `smart-nudges/index.ts` |
| Travel behaviour | `supabase/functions/_shared/ceo-behaviour/travel.ts` |
| Week-ahead invite predicate | `supabase/functions/_shared/plan/week-ahead-nudge.ts` |
| Notification forbidden words | `supabase/functions/_shared/brief/copy-vocabulary.ts` |

The rule: if Brief, Plan, and Nudges need the same business concept, it belongs in `_shared`, not inside a one-off notification file.

### 2.3 Brief / Executive Home Parity

Nudges should use persisted Brief behaviour when it exists.

Current implementation:

- loads the current Brief behaviour snapshot for the user/date/window;
- converts it through `snapshotToWiring`;
- falls back to `evaluateForScope` only when the persisted snapshot is absent;
- stamps prompt/version metadata for traceability.

Do not invent a notification-only interpretation of travel, PTO, high-stakes events, or day-kind. That creates drift.

---

## 3. Runtime Flow

### 3.1 Registration Flow

Frontend:

- `src/hooks/useDeviceTokenRegistration.ts`
- native iOS only;
- waits for auth;
- requests/checks notification permission;
- normalizes APNs token;
- calls `register-device-token`;
- emits integration telemetry;
- removes only listener handles owned by the hook.

Backend:

- `supabase/functions/register-device-token/index.ts`
- authenticates with `authenticateRequest`;
- validates APNs token shape;
- deactivates other tokens for the same user/platform;
- upserts the current token as active;
- prunes stale inactive tokens for that user.

Important: the registration hook must not call a global `removeAllListeners` on the PushNotifications plugin. That breaks notification tap handling.

### 3.2 Evaluation Flow

The `smart-nudges` function:

1. Handles diagnostic or forced test query params.
2. Creates a `notification_evaluator_runs` row.
3. Loads active `notification_device_tokens`.
4. Groups tokens by user.
5. Loads profiles, notification preferences, app-open history, context snapshots, calendar/JIT/plan/wearable signals, travel state, and Brief behaviour.
6. Applies hard suppression guards.
7. Builds candidate nudges.
8. Picks at most one candidate per user per tick.
9. Validates copy.
10. Writes `notification_log`.
11. Sends APNs unless dry run.
12. Writes `notification_evaluator_traces`.
13. Updates APNs result metadata and token state when needed.

### 3.3 Tap / Receipt Flow

Frontend:

- `src/hooks/usePushNotificationHandler.ts`
- listens for `pushNotificationActionPerformed`;
- reads `notification_type`, `notification_log_id`, and optional `deep_link_route`;
- calls engagement tracking;
- calls `notification-receipt` as a best-effort delivered signal;
- navigates to server-provided deep link first, fallback route second.

Backend:

- `notification-engagement` handles `tap`, `action_completed`, and `dismissed`.
- `notification-receipt` marks accepted pushes as delivered unless already failed/expired.

Security note: `notification-engagement` verifies the log row belongs to the authenticated user. `notification-receipt` is currently a lightweight receipt endpoint that uses service-role internally; if hardened later, preserve the iOS extension use case.

---

## 4. Delivery Guardrails

These rules are part of the product contract.

| Rule | Current Contract |
|---|---|
| Daily cap | `DAILY_NOTIFICATION_CAP = 3` |
| Per tick | `INTRA_TICK_MAX = 1` |
| Global local window | 08:00 through 21:30 local |
| App-open cooldown | 60 minutes |
| DND | read from `notification_preferences` |
| Quiet days | read from `notification_preferences.quiet_days` |
| Low-power mode | suppression/pre-evaluator guard when enabled |
| Two-hour suppression | applies unless a permitted JIT/escalation bypass exists |
| Stale JIT | must drop |
| Back-to-back day | suppress or downgrade to reminder path |
| APNs bad token | deactivate token |
| Missing APNs secrets | dry-run mode |

The daily cap must count only delivery states that represent a real send attempt or accepted delivery, such as:

- `pending`
- `accepted`
- `delivered`
- `sent`

The cap must not count:

- `suppressed`
- `dry_run`
- `failed`
- `expired`
- `expired_before_delivery`

---

## 5. Week-Ahead Picker Invite

`week_ahead_picker_invite` is a weekly digest-style invite, not a normal behavioural nudge.

Rules:

- own weekly bucket;
- one per ISO week per user;
- kill switch: `WEEK_AHEAD_PICKER_ENABLED=false`;
- default enabled when unset;
- dispatches before normal daily cap checks;
- does not consume the normal daily behavioural cap;
- does not compete with the main qualified nudge comparator;
- gated by its own predicate in `_shared/plan/week-ahead-nudge.ts`;
- writes to `notification_log` using `notification_type='week_ahead_picker_invite'`.

Do not merge this into `nudge_one`, `nudge_two`, or `nudge_three`.

---

## 6. APNs Contract

Required deployed secrets:

- `APNS_P8_KEY`
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_ENVIRONMENT`

`APNS_ENVIRONMENT` controls the host:

- `production` -> `api.push.apple.com`
- anything else / development -> `api.sandbox.push.apple.com`

Token contract:

- iOS token must be canonical lowercase hex;
- accepted lengths: 64, 72, or 128 chars;
- base64 may be normalized on the frontend before persistence;
- malformed tokens must not be persisted;
- malformed or permanently rejected tokens should be deactivated.

APNs accepted does not mean displayed. It means Apple accepted the request. Display confirmation comes from `notification-receipt` or a tap.

---

## 7. Database Contract

### 7.1 `notification_device_tokens`

Purpose: active APNs token registry.

Required shape:

- `user_id text`
- `device_token`
- `platform`
- `is_active`
- timestamps
- uniqueness on `(user_id, device_token)`

Policy:

- one active token per user/platform;
- older tokens for that user/platform are deactivated;
- dead or malformed tokens are deactivated after APNs failure.

### 7.2 `notification_preferences`

Purpose: user-facing delivery controls.

Important fields:

- `morning_anchor_enabled`
- `pre_event_prep_enabled`
- `evening_close_enabled`
- `pattern_alert_enabled`
- `state_aware_nudge_enabled`
- morning/evening windows where present
- `dnd_start`
- `dnd_end`
- `quiet_days`
- low power/offline related flags where present

`src/pages/NudgeSettings.tsx` is the frontend owner for these controls.

### 7.3 `notification_log`

Purpose: send ledger, delivery audit, engagement audit.

Important fields:

- `user_id`
- `notification_type`
- `variant_id`
- `sent_at`
- `event_reference`
- `payload jsonb`
- `delivery_state`
- `delivered_at`
- `tapped`
- `app_opened`
- `target_action_completed`
- `dismissed`
- `time_to_engagement_seconds`

Every meaningful send, dry run, suppression, APNs failure, or accepted delivery should be reconstructable from this table and evaluator traces.

### 7.4 `notification_evaluator_runs`

Purpose: one row per evaluator invocation.

Use it to answer:

- did the cron/function run;
- which evaluator version ran;
- how many users were processed;
- whether it was diagnostic/forced/dry-run;
- what environment/config was active.

### 7.5 `notification_evaluator_traces`

Purpose: per-user/per-decision trace rows.

Use it to answer:

- why a user was skipped;
- which guard fired;
- whether APNs was attempted;
- APNs status/reason;
- which notification type/variant qualified;
- whether week-ahead invite fired or was suppressed.

---

## 8. Auth / RLS Contract

Auth uses Auth0 user ids stored as text.

Rules:

- user-facing reads/writes must scope by `auth.jwt()->>'sub'`;
- edge functions may use service role internally after authenticating the caller;
- token registration must authenticate the current user;
- engagement updates must verify the log row belongs to the caller;
- cron invocation uses service role;
- frontend should not receive service-role secrets.

Do not silently switch notification user ids to UUID unless the whole Auth0 identity model is migrated.

---

## 9. Diagnostic And Test Paths

### 9.1 Diagnostic

Use:

```text
/functions/v1/smart-nudges?diagnostic=1
```

Expected to report:

- token state;
- APNs environment/host;
- last notification log;
- recent week-ahead trace;
- no runtime crash.

### 9.2 Forced Dry Run

Use one known internal user:

```text
/functions/v1/smart-nudges?force_user=<USER_ID>&force_dry=1
```

Expected:

- evaluator run row created;
- trace rows created;
- no APNs delivery attempted;
- `dry_run` notification log written only if a nudge qualifies;
- suppressions include a clear reason.

### 9.3 Forced Live Test

Only with explicit approval:

```text
/functions/v1/smart-nudges?force_user=<USER_ID>
```

Expected:

- active iOS token exists;
- APNs secrets are present;
- APNs host matches build environment;
- APNs response is recorded;
- `notification_log.delivery_state` becomes `accepted` on APNs 200;
- receipt/tap later changes it to `delivered`;
- tap updates engagement fields and routes correctly.

---

## 10. Frontend Build Contract

### 10.1 Registration Hook

When editing `useDeviceTokenRegistration`:

- keep native-only guard;
- keep auth wait/retry;
- keep APNs token normalization;
- keep 64/72/128 hex validation;
- keep telemetry events;
- keep per-hook listener cleanup only;
- keep app-resume/auth-refresh re-registration behaviour.

### 10.2 Tap Handler

When editing `usePushNotificationHandler`:

- keep native-only guard;
- keep `pushNotificationActionPerformed`;
- keep server `deep_link_route` as highest priority;
- keep `notification_log_id` engagement tracking;
- keep best-effort receipt call;
- keep fallback route map for old notification types.

### 10.3 Settings UI

When editing `NudgeSettings`:

- write `notification_preferences`, not `user_preferences`;
- preserve DND and quiet-day semantics;
- do not expose internal evaluator/debug concepts as normal user settings;
- defaults should be conservative and quiet.

---

## 11. Copy Contract

Notification copy must remain data-honest.

Do:

- name a real event, state, count, time, or user-entered signal when referenced;
- route to a specific screen;
- keep `Mind Module` as the collapsed APNs title;
- use subtitle/body for the actual nudge;
- validate against forbidden notification vocabulary;
- keep V8 meaning-forward style.

Do not:

- say a Brief, Plan, or prep is ready unless that artifact really exists;
- imply medical, diagnostic, or clinical claims;
- invent wearable values;
- invent calendar events;
- invent travel state;
- use generic motivational copy without an anchor;
- use passive CTAs like "your prep is ready" or "tap to prep".

---

## 12. Suppression QA Checklist

Any notification change must be checked against these cases:

- no active token;
- malformed token;
- APNs rejected token;
- outside global local delivery window;
- DND window;
- quiet day;
- daily cap reached;
- app opened within cooldown;
- low power mode;
- stale JIT;
- back-to-back calendar;
- missing Brief snapshot fallback;
- week-ahead invite already sent this ISO week;
- APNs secrets missing;
- APNs environment mismatch;
- tap handler route;
- engagement update belongs to authenticated user.

---

## 13. Files That Should Usually Be Edited

Use these files when building notification features:

- `supabase/functions/smart-nudges/index.ts`
- `supabase/functions/register-device-token/index.ts`
- `supabase/functions/notification-engagement/index.ts`
- `supabase/functions/notification-receipt/index.ts`
- `src/hooks/useDeviceTokenRegistration.ts`
- `src/hooks/usePushNotificationHandler.ts`
- `src/pages/NudgeSettings.tsx`
- `_shared` modules when behaviour must stay aligned with Brief / Plan.

Use migrations when schema changes are required.

Do not edit old docs or mem files as a substitute for code.

---

## 14. Build Definition Of Done

A Smart Nudges / Notifications change is done only when:

1. The code compiles.
2. The edge function still boots.
3. Forced dry-run works for one internal user.
4. Evaluator run and trace rows are written.
5. Suppressions produce clear reasons.
6. APNs secrets are not printed.
7. Token validation still rejects malformed iOS tokens.
8. Daily cap semantics are preserved.
9. Tap handling still records engagement and routes correctly.
10. Any new behaviour has a trace/audit path.

