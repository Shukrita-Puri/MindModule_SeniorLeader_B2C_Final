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
