# Apple In-App Purchase — Configuration Required

Single source of truth in code: `src/config/iapProducts.ts`.
Prices, currencies, localized names, billing periods and introductory offers are
loaded from StoreKit at runtime and are never hardcoded.

## Scope — this is not the push-notification system

`apple-notifications` is a **backend-to-backend Apple subscription webhook only**.
The existing **APNs** stack (device tokens, multi-device handling, safe
logout/unregister, Smart Nudges, scheduled reminders, diagnostics, cron
orchestration) is a separate system and is untouched by the IAP work. The two
must remain independent — the subscription webhook never sends user pushes, and
the APNs system never processes subscription events. See
`APPLE_NOTIFICATIONS_SETUP.md` §0.

App Store Connect configuration (products, V2 notification URLs, IAP key)
remains a manual action by the Apple account owner.

## Product IDs

| Plan | App Store Connect ref | Product ID used by the app | Status |
|---|---|---|---|
| Pro Monthly | 6794852233 | `com.mindmodule.pro.monthly` | ✅ Confirmed |
| Pro Annual  | 6794852439 | `com.mindmodule.pro.annual`  | ✅ Confirmed |

No trial product exists and none must ever be created. Product ids such as
`com.mindmodule.pro.trial` or `com.mindmodule.pro.7daytrial` are forbidden — the
7-day free trial is an **Introductory Offer attached to the two subscriptions
above**, inside the single `Mind Module Pro` subscription group.

## 7-day free trial (Apple Introductory Offer)

Model: one subscription group, two auto-renewable subscriptions, one
**Introductory Offer → Free Trial → 7 days** on each.

Runtime behaviour (implemented):

- The native plugin asks StoreKit for `isEligibleForIntroOffer` per subscription
  and only returns `introOffer` when the signed-in Apple ID is eligible.
- `paymentMode` is normalized to `freeTrial` / `payAsYouGo` / `payUpFront`; only
  `freeTrial` produces trial copy.
- `src/utils/introOffer.ts` builds all trial strings from Apple's data:
  `"7-day free trial"`, `"then <localized price> per <period>"`, the CTA
  `"Start 7-day free trial"`, and the auto-renewal + cancellation disclosure.
- Ineligible users (already trialled, resubscribers) see standard paid pricing,
  a `Subscribe` CTA and no trial text.
- Trial duration, currency, localized price and availability are never
  hardcoded — change the offer in App Store Connect and the app follows.

Lifecycle: trial start, conversion to paid, cancellation during trial, renewal,
expiry, refund and revocation are all handled by the existing
`verify-apple-purchase` + `apple-notifications` (V2) path. Entitlement rule is
unchanged: **active Apple subscription OR active Stripe subscription = Pro**.

Owner actions still required in App Store Connect (per subscription, Monthly and
Annual): Subscription → *Introductory Offers* → Create → territories: All →
type **Free**, duration **1 week (7 days)** → no end date → save, then submit
with the next app version. Finally validate with a StoreKit Sandbox tester
(fresh Sandbox Apple ID, buy Monthly, confirm trial copy and the "7 days free,
then …" system sheet; cancel mid-trial; re-open the paywall with the same
Apple ID and confirm the trial copy is gone).

### Product ID conflict — RESOLVED

Both product IDs are now confirmed in App Store Connect and are unique. Monthly
does **not** use the annual ID anywhere in the codebase. Guards still in place:

- `getIapConfigStatus().duplicateIds` — if both ids ever resolve to the same
  string (e.g. a bad env override), the paywall refuses to sell and shows
  "Monthly and annual are configured with the same Apple product id."
- `src/config/__tests__/iapProducts.test.ts` asserts both ids are exact, unique
  and mapped monthly-first.

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
3. Add a **7-day free trial introductory offer** to each (Free, 1 week, all
   territories). Do NOT create a separate trial product. The app only renders
   trial copy when StoreKit returns the offer AND reports the Apple ID eligible.
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
- Apple API credentials (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`,
  `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`).

**D. Manual App Store Connect steps** — see list above.
