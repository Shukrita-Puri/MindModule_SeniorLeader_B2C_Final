# Apple In-App Purchase — status and required App Store Connect configuration

Last verified against the codebase: 27 July 2026.

Single source of truth in code: `src/config/iapProducts.ts`. Prices, currencies,
localized names, billing periods and introductory offers are read from StoreKit
at runtime and are never hardcoded — enforced by
`src/__tests__/iosPricingSourceOfTruth.test.ts`.

## Scope — this is not the push-notification system

`apple-notifications` is a **backend-to-backend Apple subscription webhook only**.
The APNs stack (device tokens, Smart Nudges, scheduled reminders, diagnostics,
cron orchestration) is a separate system and is untouched by the IAP work. The
separation is enforced by
`supabase/functions/_shared/apple-webhook-separation.test.ts`. See
`APPLE_NOTIFICATIONS_SETUP.md` §0.

## Products

| Plan | App Store Connect ref | Product ID | Duration |
|---|---|---|---|
| Pro Monthly | 6794905314 | `me.mindmodule.pro.monthly` | 1 month |
| Pro Annual  | 6794905448 | `me.mindmodule.pro.annual`  | 1 year |

Both live in ONE subscription group: **Mind Module Pro**.

No trial product exists and none must ever be created. Ids such as
`com.mindmodule.pro.trial` are forbidden — the 7-day free trial is an
**Introductory Offer attached to the two subscriptions above**.

Environment overrides (no code change needed):

```
VITE_APPLE_PRO_MONTHLY_PRODUCT_ID=me.mindmodule.pro.monthly
VITE_APPLE_PRO_ANNUAL_PRODUCT_ID=me.mindmodule.pro.annual
```
Legacy names `VITE_IAP_PRODUCT_ID_MONTHLY` / `_ANNUAL` are still honoured.

Server secrets (never committed): `APPLE_BUNDLE_ID`, `APPLE_TEAM_ID`,
`APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ENVIRONMENT`
(`Production` | `Sandbox`), optional `APPLE_ROOT_CA_G3_B64`.

## Already handled in code — verified

| Behaviour | Where |
|---|---|
| iOS shows the Apple paywall, never Stripe checkout | `src/pages/onboarding/stages/Stage6Payment.tsx` (early return), `src/config/purchasePlatform.ts` |
| Products loaded only from StoreKit, monthly-then-annual | `src/services/iap.ts`, `src/config/iapProducts.ts` |
| Partial product return still renders the plans Apple did send | `src/components/subscription/ApplePaywall.tsx` |
| Zero / partial / error / store-disabled states are distinct and calm | `ApplePaywall.tsx` + `loadIapProductsWithDiagnostics()` |
| Diagnostics log product ids, counts, storefront and native error codes only — never receipts, JWS, appAccountToken or Apple identity | `src/services/iap.ts`, covered by `src/services/__tests__/iapProductDiagnostics.test.ts` |
| Trial copy built purely from Apple's `paymentMode` + period; ineligible users see paid copy and a `Subscribe` CTA | `src/utils/introOffer.ts` |
| Purchase / pending / cancelled / failed handling | `ApplePaywall.tsx` |
| Restore Purchases, Manage Subscription (Apple deep link only) | `ApplePaywall.tsx`, `iap.ts` |
| Entitlement sync on cold start, foreground resume, StoreKit transaction updates | `IapEntitlementWatcher` in `src/App.tsx`, `onIapTransactionUpdate()` |
| Renewal / expiry / refund / revocation convergence | `supabase/functions/apple-notifications`, `_shared/apple-entitlement.ts` |
| Server-side JWS verification, bundle-id check, idempotent upsert, Auth0 `sub` identity | `supabase/functions/verify-apple-purchase` |
| Stripe blocked server-side for iOS callers (`ios_requires_iap`) | `supabase/functions/create-checkout-session`, `create-customer-portal`, `cancel-subscription` |
| Existing Stripe subscribers on iOS see read-only status, never a repurchase CTA | `ApplePaywall.tsx`, `isNonApplePaidEntitlement()` |
| Entitlement rule: active Apple **or** active Stripe subscription = Pro | `src/utils/subscriptionHelpers.ts` |
| Account deletion happens server-side before sign-out | `src/components/profile/DeleteAccountDialog.tsx`, `supabase/functions/delete-my-account` |
| Review prompt suppressed on onboarding / payment / auth / error routes | `src/services/appReview.ts` |
| No currency amount rendered on any iOS-reachable surface (paywall, upgrade modal, Terms) | `src/__tests__/iosPricingSourceOfTruth.test.ts` |
| Webhook reachable unauthenticated by Apple | `[functions.apple-notifications] verify_jwt = false` in `supabase/config.toml` |

## Still required in App Store Connect — owner only

These cannot be performed from code. The account holder must complete them.

1. **Subscription group** — confirm exactly one group named `Mind Module Pro`
   containing both subscriptions. Do not create a second group.
2. **Product IDs** — confirm `me.mindmodule.pro.monthly` (1 month) and
   `me.mindmodule.pro.annual` (1 year) exist, are unique, and sit under bundle
   `com.moonshot.mindmoduleapp`.
3. **Per subscription**: complete Subscription Prices (all territories),
   Localizations (display name + description), and the review screenshot.
   A subscription missing any of these is not returned by StoreKit.
4. **7-day free trial** — for each subscription: Introductory Offers → Create →
   Territories: All → Type **Free** → Duration **1 week** → no end date → Save.
   Do NOT create a separate trial product.
5. **Attach both subscriptions to the app version** being submitted
   (App Store → your version → In-App Purchases and Subscriptions).
6. **App Store Server Notifications V2** — set Production and Sandbox URLs to:
   `https://iyilcpvercoywaweybpc.supabase.co/functions/v1/apple-notifications`
   Version 2 only (see `APPLE_NOTIFICATIONS_SETUP.md`).
7. **In-App Purchase key** — Users and Access → Integrations → In-App Purchase →
   create key, download `.p8`, note Key ID + Issuer ID, store as backend secrets.
8. **Agreements, Tax and Banking** — Paid Applications Agreement active,
   banking and tax complete. Products never load until this is done.
9. **Sandbox validation** with a fresh Sandbox Apple ID: buy Monthly, confirm the
   "7 days free, then …" system sheet and in-app trial copy; cancel mid-trial;
   reopen the paywall with the same Apple ID and confirm trial copy is gone;
   test Restore Purchases; test Annual; confirm entitlement appears server-side.

If the paywall shows no plans, read the `[iap] product-load …` console line on
device: the `missing=` list names exactly which product id App Store Connect is
not returning, and `outcome=` distinguishes App Store Connect state from a code
or device problem.

## Known non-blocking gaps

- Server-side re-verification through the App Store Server API only activates
  once the Apple API credentials above are stored as backend secrets.
- Web (Stripe) pricing copy in `src/pages/onboarding/stages/Stage6Payment.tsx`
  is still a hardcoded table. It is unreachable inside the iOS shell, but it
  must be reconciled with the live Stripe prices before web launch.
