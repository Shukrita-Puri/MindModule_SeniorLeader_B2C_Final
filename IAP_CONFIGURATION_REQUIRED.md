# Apple In-App Purchase — Configuration Required

Single source of truth in code: `src/config/iapProducts.ts`.
Prices, currencies, localized names, billing periods and introductory offers are
loaded from StoreKit at runtime and are never hardcoded.

## Product IDs

| Plan | App Store Connect ref | Product ID used by the app | Status |
|---|---|---|---|
| Pro Monthly | 6794852233 | `com.mindmodule.pro.monthly` | ⚠️ **PENDING CONFIRMATION** |
| Pro Annual  | 6794852439 | `com.mindmodule.pro.annual`  | ✅ Confirmed |

### 🚨 BLOCKER — duplicate product id reported

App Store Connect currently shows `com.mindmodule.pro.annual` for **both**
products. Apple product ids are globally unique, so the monthly entry is
misconfigured or was misread. The app deliberately does **not** reuse the annual
id for the monthly plan.

Until the monthly id is confirmed:
- `getIapConfigStatus().monthlyNeedsConfirmation === true`
- If both ids ever resolve to the same string, the paywall refuses to sell and
  shows "Monthly and annual are configured with the same Apple product id."

**Action:** open App Store Connect → Subscriptions → Mind Module Pro group →
Pro Monthly and read the exact **Product ID** field. Then either
(a) confirm it is `com.mindmodule.pro.monthly`, or
(b) set the override below.

## Environment overrides (no code change needed)

```
VITE_APPLE_PRO_MONTHLY_PRODUCT_ID=com.mindmodule.pro.monthly
VITE_APPLE_PRO_ANNUAL_PRODUCT_ID=com.mindmodule.pro.annual
```
Legacy names `VITE_IAP_PRODUCT_ID_MONTHLY` / `_ANNUAL` are still honoured.

Server side (Supabase secrets — never commit): `APPLE_BUNDLE_ID`,
`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY`,
`APPLE_ENVIRONMENT` (`Production` | `Sandbox`), optional `APPLE_ROOT_CA_G3_B64`.

## Manual App Store Connect steps

1. Create ONE subscription group: **Mind Module Pro**.
2. Add two **Auto-Renewable Subscriptions** (not consumable/non-consumable):
   - Pro Monthly — 1 month duration.
   - Pro Annual — 1 year duration.
3. Add a **7-day free trial introductory offer** to each. The app only renders
   trial copy when StoreKit actually returns the offer.
4. Complete localizations, review screenshot, and pricing per territory.
5. Users and Access → Integrations → In-App Purchase → create key, download
   `.p8`, note Key ID + Issuer ID → store as Supabase secrets.
6. App Store Server Notifications → **Version 2** →
   `https://iyilcpvercoywaweybpc.supabase.co/functions/v1/apple-notifications`
   (see `APPLE_NOTIFICATIONS_SETUP.md`).
7. Sandbox-test: purchase, trial, cancel, renew, refund, restore.

## Status

**A. Implemented and verified**
- Centralized, environment-safe product config with duplicate-id guard.
- StoreKit 2 native plugin, runtime product load, monthly-then-annual ordering.
- Purchase / pending / cancelled / failed handling, Restore Purchases,
  Manage Subscription (Apple only), launch + resume entitlement refresh,
  duplicate-purchase suppression for already-entitled users.
- Server-side verification (`verify-apple-purchase`) and V2 notification
  handling with idempotency; Auth0 `sub` remains the identity.
- iOS/iPadOS shows no Stripe checkout, external payment button or web purchase
  link; Stripe remains live on web and is rejected server-side for iOS callers.

**B. Implemented, awaiting deployment/config**
- Server-side re-verification via App Store Server API activates once the Apple
  API credentials are stored as Supabase secrets.

**C. Blocked**
- Monthly product ID confirmation (see BLOCKER above).
- Apple API credentials (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
  `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`).

**D. Manual App Store Connect steps** — see list above.
