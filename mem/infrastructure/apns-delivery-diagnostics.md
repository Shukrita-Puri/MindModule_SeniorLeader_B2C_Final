---
name: APNs delivery diagnostics & token hygiene
description: smart-nudges writes apns_status/apns_reason/apns_token_prefix back onto notification_log.payload after each push; auto-deactivates tokens on APNs 410 Unregistered or 400 BadDeviceToken; register-device-token rejects non-64-hex iOS tokens with 400.
type: feature
---
**Where**:
- `supabase/functions/smart-nudges/index.ts` — `sendApnsPush` returns `{ ok, status, reason }`; main loop updates `notification_log.payload` with `apns_status`/`apns_reason`/`apns_token_prefix` and deactivates dead tokens in `notification_device_tokens`.
- `supabase/functions/register-device-token/index.ts` — validates iOS device tokens are exactly 64 hex chars before upsert.

**Why**: Pre-fix, notification_log rows had no APNs result → impossible to tell from SQL whether a push was delivered. Stale 160-char (legacy double-encoded) tokens and `Unregistered` (410) tokens stayed `is_active=true` forever, getting silently rejected every tick.

**Debug recipe**:
```sql
SELECT user_id, notification_type, sent_at,
       payload->>'apns_status' AS apns_status,
       payload->>'apns_reason' AS apns_reason
FROM notification_log
WHERE sent_at > now() - interval '24 hours'
ORDER BY sent_at DESC;
```
APNs config (production): host `api.push.apple.com`, topic `com.moonshot.mindmoduleapp`, env `production` via `APNS_ENVIRONMENT`. iOS bundle id matches.

**Probe tool**: POST to `/test-push` with no body → returns per-token APNs status for every active iOS token.
