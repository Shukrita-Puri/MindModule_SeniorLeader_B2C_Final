## Audit result: the pipeline is working

Direct probe of `test-push` against all 11 active iOS device tokens:

```text
8/11 → APNs HTTP 200  ✅ delivered
2/11 → HTTP 400 BadDeviceToken (token length 160 chars, should be 64)
1/11 → HTTP 410 Unregistered  (user uninstalled / revoked)
```

End-to-end status by layer:

1. **Device registration** — working. `useDeviceTokenRegistration.ts` requests permission, receives the APNs token, and POSTs it to `register-device-token`. Tokens are saved per-user in `notification_device_tokens`.
2. **APNs send path** — working. `smart-nudges` loads `APNS_P8_KEY/KEY_ID/TEAM_ID`, builds a valid ES256 JWT, and posts to `api.push.apple.com` with topic `com.moonshot.mindmoduleapp` (matches the iOS bundle id). Logs confirm `dry_run: false` and `Key normalized OK: 200 base64 chars`.
3. **Cron** — working. `pg_cron` job `smart-nudges` runs every 10 min, last 10 runs all `succeeded`. 107 notifications logged in the past 7 days, 11 in the past 24h.
4. **Backend logs / DB** — `notification_log` rows are being created correctly. Quiet hours / cool-downs / eligibility logic is firing as designed (most ticks return 0 notifications, which is expected).

So nothing is broken in the chain itself. Two real problems remain that explain "I'm not getting notifications":

- **Invalid 160-char tokens** stuck `is_active = true` for 2 users. APNs rejects them every time. These came from an older registration path that double-encoded the token.
- **`Unregistered` (HTTP 410)** tokens are not being deactivated automatically, so smart-nudges keeps trying them.
- **No APNs response is persisted on `notification_log`**, so we can't tell from the DB whether a row was actually delivered. Today the only signal is edge-function logs.

## Fix (minimal, surgical — no rewrite)

### 1. Persist APNs result on `notification_log`
Add two payload fields written by `smart-nudges` after each `sendApnsPush`:
- `payload.apns_status` — HTTP status code (200 / 400 / 410 / etc.)
- `payload.apns_reason` — body returned by APNs (`"success"`, `BadDeviceToken`, `Unregistered`, ...)

Update the existing insert to a two-step `insert ... select id` followed by `update notification_log set payload = payload || jsonb_build_object(...)` so we don't have to restructure the loop. This makes future debugging trivial via SQL.

### 2. Auto-deactivate dead tokens inside `smart-nudges`
When `sendApnsPush` returns status `400 BadDeviceToken`, `403 ExpiredProviderToken`-on-token (rare) or `410 Unregistered`, `update notification_device_tokens set is_active = false` for that exact `(user_id, device_token)`. This is APNs' documented contract and stops the bleed.

### 3. Reject malformed tokens at registration time
In `register-device-token`, validate that `device_token` is exactly 64 lowercase/uppercase hex chars before upserting. Anything else returns HTTP 400. This prevents the 160-char artifact from ever being persisted again.

### 4. One-time cleanup of existing bad rows
Migration:
```sql
update public.notification_device_tokens
set is_active = false
where platform = 'ios'
  and is_active = true
  and (length(device_token) <> 64 or device_token !~ '^[0-9a-fA-F]{64}$');
```
The 2 affected users will re-register a clean token automatically the next time they open the app (the existing `useDeviceTokenRegistration` hook handles this).

### 5. Add a verification probe
After the changes deploy, re-invoke `test-push` and `smart-nudges` and report:
- the per-token APNs status array from `test-push`
- the new `apns_status` distribution from `notification_log` for the latest tick

## Files touched

- `supabase/functions/smart-nudges/index.ts` — extend the per-notification loop (~15 lines) to capture `sendApnsPush` result, write it back to `notification_log.payload`, and deactivate the device token on 400/410.
- `supabase/functions/register-device-token/index.ts` — add 4-line hex-format guard.
- New migration to deactivate currently-broken tokens.

## Out of scope

- Rewriting the notification system or its scheduling/eligibility rules.
- Changing APNs environment, bundle id, or JWT signing.
- Touching the iOS native registration code (it already produces correct 64-char tokens; the historical bad tokens predate the current code path).

## Risk
Very low. Three small surgical edits in two functions plus a deactivate-only migration. No schema changes, no behavior change for currently-working tokens.
