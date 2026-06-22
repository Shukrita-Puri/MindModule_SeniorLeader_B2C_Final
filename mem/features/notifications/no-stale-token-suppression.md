---
name: No stale-token push suppression
description: smart-nudges must not gate APNs delivery on notification_device_tokens.updated_at age (it's not a heartbeat). Only token absence, inactive flag, prefs/DND, dedupe/rate-limit, or APNs permanent failure may suppress. Diagnostic field is activityAgeMin / last_activity_age_min.
type: constraint
---
**Why:** `notification_device_tokens.updated_at` only changes on token rotation / app launch, so treating it as a freshness heartbeat silently blocks push to users who haven't relaunched recently — exactly the population push is meant to reach.

**Rules:**
- Do NOT reintroduce `suppression_reason: 'offline'` or `skip-offline` based on `updated_at` age.
- `DEVICE_OFFLINE_STALE_MIN` must not appear inside any send-gate conditional.
- May compute `activityAgeMin` for diagnostics; log as `last_activity_age_min` only.
- APNs token deactivation stays scoped to permanent failures: HTTP 410 Unregistered, 400 BadDeviceToken, DeviceTokenNotForTopic. Transient/network errors do not deactivate.
- Regression tests live in `supabase/functions/smart-nudges/offline_suppression_removed_test.ts`.