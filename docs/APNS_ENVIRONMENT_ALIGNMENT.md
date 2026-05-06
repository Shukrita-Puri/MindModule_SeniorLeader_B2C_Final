# APNs Environment Alignment

The iOS app's `aps-environment` entitlement, the build's signing mode, and the
Supabase `APNS_ENVIRONMENT` secret must all describe the **same** APNs network,
or pushes return `BadDeviceToken` and never deliver.

| Build channel        | Xcode config | Entitlement file              | `aps-environment` | Supabase `APNS_ENVIRONMENT` | APNs host                       |
| -------------------- | ------------ | ----------------------------- | ----------------- | --------------------------- | ------------------------------- |
| Local dev / `cap run`| Debug        | `App/App.Debug.entitlements`  | `development`     | `development`               | `api.sandbox.push.apple.com`    |
| TestFlight / App Store | Release    | `App/App.Release.entitlements`| `production`      | `production`                | `api.push.apple.com`            |

Xcode now selects the entitlement file by configuration (see `CODE_SIGN_ENTITLEMENTS`
in `ios/App/App.xcodeproj/project.pbxproj`). After pulling, run `npx cap sync ios`.

## Verify delivery

```sql
SELECT user_id,
       notification_type,
       sent_at,
       payload->>'apns_status' AS apns_status,
       payload->>'apns_reason' AS apns_reason,
       payload->>'apns_token_prefix' AS token_prefix
FROM notification_log
WHERE sent_at > now() - interval '24 hours'
ORDER BY sent_at DESC;
```

- `apns_status = 200` / `apns_reason = success` → delivered to APNs.
- `apns_status = 400` / `apns_reason = BadDeviceToken` → environment mismatch
  (sandbox token sent to production host or vice versa). Reinstall the app on
  the matching build channel, or flip `APNS_ENVIRONMENT` to match.
- `apns_status = 410` / `apns_reason = Unregistered` → token is dead;
  `smart-nudges` auto-deactivates it in `notification_device_tokens`.

## Manual probe

`POST /functions/v1/test-push` (optionally `{ "email": "user@example.com" }`)
returns per-token APNs status. Run it after install to confirm the device
token registered by `register-device-token` works against the configured
`APNS_ENVIRONMENT`.

## v5.3 — Delivery State, TTL & Collapse (Chief-of-Staff)

Every push now carries `apns-expiration` (per-intent TTL) and `apns-collapse-id` (`${family}-${YYYY-MM-DD}`, or `travel-${date}` for pre-/in-flight). After expiry APNs silently drops queued pushes — no zombie notifications.

`notification_log` columns: `delivery_state` (`accepted`, `delivered`, `expired_before_delivery`, `failed`) and `delivered_at`. The iOS Notification Service Extension (`ios/App/NotificationService/`) and the in-app tap handler both POST `{ notification_log_id, received_at }` to the new `notification-receipt` edge function which flips `accepted → delivered`.

Per-family TTL map (see `nudgeTtlSeconds` in `smart-nudges/index.ts`):
- `nudge_one_jit` / `nudge_one_pre_flight`: 45 min
- `nudge_one_morning` / `nudge_one_post_arrival`: 3 h
- `nudge_two_recalibrate` / `nudge_two_reserves`: 2 h
- `nudge_two_in_flight`: 90 min
- `nudge_three`: 6 h, `nudge_three_lookahead`: 10 h
- `test_push`: 1 h

Travel arc, pattern-promoted JITs, look-ahead and PTO-collapse all ride the existing 3 slots — never a 4th send.

### Verify
```sql
SELECT notification_type, payload->>'apns_expiration' AS exp,
       payload->>'apns_collapse_id' AS collapse,
       delivery_state, delivered_at, sent_at
FROM notification_log
WHERE sent_at > now() - interval '24 hours'
ORDER BY sent_at DESC;
```

### Native target (one-time)
After `npx cap sync ios`, add a Notification Service Extension target in Xcode that POSTs to `${SUPABASE_URL}/functions/v1/notification-receipt` with the `notification_log_id` from the push payload.
