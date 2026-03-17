

## Push Notification Pipeline Audit — Root Causes & Fix Plan

### Root Causes Found

**Issue 1 (CRITICAL): No cron job to invoke `smart-nudges`**
The `smart-nudges` edge function is never called. There is no `pg_cron` job scheduled for it (only `refresh-calendar-tokens` and `sync-calendar-scheduled` exist). The function has zero logs. This is the primary reason notifications are not being delivered — the delivery pipeline simply never runs.

**Issue 2 (CRITICAL): APNs topic / bundle ID mismatch**
The iOS bundle identifier is `com.moonshot.mindmoduleapp`. The `smart-nudges` function defaults to `app.mindmodule.me` (line 925: `Deno.env.get('APNS_BUNDLE_ID') || 'app.mindmodule.me'`). APNs will reject every push with a `TopicDisallowed` or `BadDeviceToken` error because the topic doesn't match the provisioning profile the device registered under.

**Issue 3 (MODERATE): APNs environment mismatch**
The iOS entitlement `aps-environment` is set to `development`, meaning device tokens are sandbox tokens. However, `sendApnsPush` always sends to `api.push.apple.com` (production). Sandbox tokens are invalid on the production endpoint — APNs will return 400/BadDeviceToken. The function needs to support `api.sandbox.push.apple.com` for development builds.

**Issue 4 (LOW): Dry-run mode is logged but not prominently surfaced**
When APNs credentials are missing, the function logs `DRY RUN` but doesn't log *why* (which credential is missing). This makes debugging harder.

### Fixes

1. **Create the `pg_cron` job for `smart-nudges`** — schedule it every 15 minutes, matching the documented architecture. This is a database migration.

2. **Fix APNs bundle ID default** in `smart-nudges/index.ts` line 925 — change the fallback from `'app.mindmodule.me'` to `'com.moonshot.mindmoduleapp'`.

3. **Add APNs environment support** in `smart-nudges/index.ts`:
   - Read an `APNS_ENVIRONMENT` secret (default: `development`).
   - Use `api.sandbox.push.apple.com` when environment is `development`, `api.push.apple.com` when `production`.
   - Log which APNs host is being used.

4. **Improve dry-run logging** — when `isDryRun` is true, log exactly which credentials are missing.

5. **Add diagnostic logging** to `sendApnsPush` — log the APNs host, topic, and truncated token before each send attempt.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/smart-nudges/index.ts` | Fix bundle ID default, add environment-aware APNs host, improve logging |
| Database migration (SQL) | Create `pg_cron` job to invoke `smart-nudges` every 15 minutes |

### No Changes Needed (Verified Working)

- **iOS entitlements / Info.plist / AppDelegate.swift** — correctly configured for push (aps-environment, remote-notification background mode, Capacitor forwarding)
- **`useDeviceTokenRegistration.ts`** — working correctly (tokens are being persisted; DB confirms active tokens exist)
- **`register-device-token` edge function** — working (logs show successful registration)
- **`usePushNotificationHandler.ts`** — correct tap handling and routing
- **APNs credentials** — `APNS_P8_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` are all present in secrets

### What Still Requires Live Testing

- Verify a push is actually delivered to a physical device after the cron job fires
- Confirm the device token format in DB matches what APNs expects (one token in DB looks suspiciously long at 136 hex chars — standard APNs tokens are 64 hex chars)
- When the app is built for production (App Store), update `APNS_ENVIRONMENT` secret to `production`

