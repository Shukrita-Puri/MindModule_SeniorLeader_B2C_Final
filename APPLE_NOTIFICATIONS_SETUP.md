# Apple App Store Server Notifications V2 — Setup

Backend handler for Apple subscription lifecycle events for the Mind Module iOS app.
Web/other platforms continue to use Stripe. The entitlement rule is unchanged:

> **active Apple subscription OR active Stripe subscription = Pro access**

An Apple write never clears Stripe columns, and an active Stripe subscription keeps
`subscription_provider = 'stripe'` so a user is never double-billed.

---

## 1. Deployed function URL

```
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/apple-notifications
```

- **Production Server URL:** the URL above (production App Store Connect field)
- **Sandbox Server URL:** the same URL (sandbox App Store Connect field)

The function handles both environments; every notification carries its own
`environment` field and is stored alongside the transaction. Do **not** use a
Lovable preview URL — Apple must call the Supabase Functions host.

The endpoint is intentionally unauthenticated (Apple cannot send a JWT). Trust
comes from Apple's JWS signature, which is verified before any payload field is
read.

## 2. Required secrets (backend environment variables)

| Secret | Purpose | Required |
| --- | --- | --- |
| `APPLE_BUNDLE_ID` | Rejects notifications for any other app (`com.moonshot.mindmoduleapp`) | Yes |
| `APPLE_ISSUER_ID` | App Store Connect API issuer id (UUID) | For server-API re-verification |
| `APPLE_KEY_ID` | Key ID of the In-App Purchase `.p8` key | For server-API re-verification |
| `APPLE_PRIVATE_KEY` | Contents of the `.p8` private key (PEM) | For server-API re-verification |
| `APPLE_ENVIRONMENT` | `Production` or `Sandbox` — which host to try first | Optional (defaults to Production) |
| `APPLE_TEAM_ID` | Apple Developer Team ID, used by StoreKit/APNs tooling | Optional |
| `APPLE_ROOT_CA_G3_B64` | Base64 DER of Apple Root CA G3; pins the JWS chain root | Recommended |

Never hardcode these or commit a `.p8` file. They are stored as backend secrets
and read via `Deno.env.get`.

If the server-API credentials are absent the function still works: it processes
the signed notification payload only, and skips the extra re-verification call.

## 3. Deploying

Edge functions in this project deploy automatically when changed. To force a
redeploy, redeploy the `apple-notifications` function from the backend tooling.
There is no manual CLI step required.

## 4. Testing safely

1. **Reachability / rejection check** (safe to run against production):
   ```bash
   curl -s -X POST https://<REF>.supabase.co/functions/v1/apple-notifications \
     -H 'content-type: application/json' -d '{"signedPayload":"not-a-jws"}'
   # => {"error":"Invalid Apple signature"}  (HTTP 401)
   ```
   An unsigned or tampered payload must never be accepted.
2. **App Store Connect → "Request a Test Notification"** for both Sandbox and
   Production. The function acknowledges `TEST` notifications and records them in
   `apple_notification_events`.
3. **Sandbox purchase flow** on a real device with a Sandbox Apple ID: purchase,
   cancel, let it renew, and refund via the sandbox tools. Verify rows appear in
   `apple_transactions` and that `profiles.subscription_status` /
   `apple_expires_at` follow the lifecycle.
4. **Idempotency:** re-send the same `notificationUUID`; the response is
   `{"ok":true,"duplicate":true}` and no state changes.

### Logging policy

Logs contain notification type, subtype and outcome only. Signed payloads,
receipts, private keys, tokens, raw transaction ids in warnings, and any health
or personal data are never logged.

## 5. App Store Connect configuration (manual — account owner only)

Lovable has no access to App Store Connect. These steps must be done by the
Apple Developer account holder:

1. **App Store Connect → your app → General → App Information → App Store Server
   Notifications.**
2. Set **Production Server URL** to the function URL above.
3. Set **Sandbox Server URL** to the same function URL.
4. **Select "Version 2" notifications** for both fields. Version 1 payloads are
   rejected by this function.
5. Save, then use **Request a Test Notification** for each environment.
6. **Users and Access → Integrations → In-App Purchase** — generate an In-App
   Purchase key; download the `.p8` once, note the **Key ID** and **Issuer ID**,
   and store them as the secrets in section 2.
7. Create the subscription group and the two auto-renewable products
   (`com.mindmodule.pro.monthly`, `com.mindmodule.pro.annual`) — both confirmed
   and unique; see `IAP_CONFIGURATION_REQUIRED.md`.

## 6. What the function does

- Verifies the notification JWS (ES256, `x5c` chain, optional pinned Apple Root
  CA G3), then the nested `signedTransactionInfo` and `signedRenewalInfo`.
- Rejects malformed, unsigned, tampered, wrong-bundle and stale (>7 day)
  payloads.
- Claims each `notificationUUID` in `apple_notification_events` before doing any
  work — duplicates are acknowledged without reprocessing; a ledger failure
  returns 500 so Apple retries.
- Resolves the Auth0 `sub` server-side from `apple_transactions` or
  `profiles.apple_original_transaction_id`. Never from caller-supplied data.
- Re-verifies entitlement-changing types (`SUBSCRIBED`, `DID_RENEW`, `EXPIRED`,
  `DID_FAIL_TO_RENEW`, `REFUND`, `REVOKE`, `GRACE_PERIOD_EXPIRED`,
  `OFFER_REDEEMED`, `DID_CHANGE_RENEWAL_STATUS`) against the App Store Server API
  when credentials are configured.
- Treats `PRICE_INCREASE`, `REFUND_DECLINED`, `CONSUMPTION_REQUEST`,
  `RENEWAL_EXTENDED` and `TEST` as informational: recorded, no entitlement change.
- Persists original transaction id, transaction id, product id, environment,
  expiry (grace-period aware), auto-renew status, cancellation date,
  refund/revocation state, notification id/type and last notification time.
- Returns 200 only after the state write has completed.

## 7. Data model

- `apple_transactions` — one row per Apple transaction id (unique), the ledger.
- `apple_notification_events` — one row per Apple `notificationUUID` (unique),
  the idempotency gate and audit trail.
- `profiles.apple_*` — the current entitlement snapshot for the Auth0 user.

Both tables are service-role only under RLS; no client can read or write them.