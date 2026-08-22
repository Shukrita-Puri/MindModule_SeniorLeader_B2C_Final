# Paywall currency audit: why iOS shows USD, and what (if anything) to change

## What the code actually does today

Two different payment surfaces, two different price sources:

1. **Web / Stripe payment page** (`Stage6Payment.tsx`) — currency is hardcoded `GBP` and the price map is `£34.99` monthly / `£299.99` annual. This surface is already GBP-only, and a test asserts it contains no `$` literal.
2. **iOS paywall** (`ApplePaywall.tsx`) — every price string is `product.displayPrice` returned by StoreKit through the native plugin (`InAppPurchasePlugin.swift` passes `product.displayPrice` and `product.priceFormatStyle.currencyCode` straight through). There is no currency conversion, no `$` literal, and the only hardcoded strings are the GBP fallbacks `£34.99` / `£299.99` used when StoreKit returns nothing.

Both the onboarding payment page and the Profile → Subscription route render the same components; the Profile route reaches `Stage6Payment`, which renders `ApplePaywall` first when inside the iOS shell.

## Root cause of the `$34.99` in the screenshot

`displayPrice` is formatted by Apple for the **storefront of the Apple ID signed into the device**, not the developer's App Store Connect base currency. The screenshot is a TestFlight build showing `$34.99` / `$299.99` — exactly the US-storefront rendering of the GBP base price tier. The sandbox / TestFlight Apple ID in use has a **US storefront (region United States)**, so StoreKit correctly returns USD.

This is not a bug in the app, and it must not be "fixed" in code: forcing `£` onto a US-storefront price would display a price the user will not be charged — an App Store review rejection (Guideline 3.1.2) and a consumer-law problem. The existing tests exist specifically to prevent that.

To see GBP on device, the signed-in **sandbox tester account's country must be United Kingdom** (App Store Connect → Users and Access → Sandbox Testers → the tester's Country/Region), or the TestFlight tester must be on a UK Apple ID. Real UK customers will always see GBP.

## Restore Purchases showing "[Sandbox] You do not have any subscriptions"

Expected. The sheet is Apple's own sandbox subscriptions sheet, and it is empty because that sandbox Apple ID has never completed a purchase of this app's products. `[Sandbox]` is Apple's environment label; it disappears in production, and in production the sheet lists the user's real subscriptions. Restore itself is wired correctly: `restoreIapPurchases()` → `verify-apple-purchase` edge function → entitlement written server-side. No change needed.

## Proposed change (small, verification-focused)

Nothing about pricing logic changes. The only gap is that there is no way to confirm the storefront from the device without console logs, which is why this looked like a code bug.

- Surface the storefront/locale that StoreKit reported on the paywall's existing diagnostics block (`ApplePaywall.tsx` already renders `describeIapLoadDiagnostics(diagnostics)`, and `diagnostics.storefront` / `diagnostics.locale` are already plumbed through from the native plugin). Show a short line such as `Storefront: US · en_GB` under the plan cards in non-production builds only, so a tester can confirm at a glance which storefront is pricing the products.
- Add a test asserting the paywall never renders a currency symbol it did not receive from StoreKit (i.e. the only hardcoded amounts stay the two GBP fallbacks) — this locks in the current, correct behaviour.

## Explicitly not doing

- No currency conversion, no forcing GBP onto `displayPrice`, no locale override in the native plugin.
- No change to `Stage6Payment`'s GBP Stripe pricing (already correct).
- No change to restore/entitlement flow.

## Actions for you (outside the code)

1. Set the sandbox tester's Country/Region to United Kingdom (or sign into a UK Apple ID) and relaunch — the paywall will then read `£34.99` / `£299.99`.
2. Confirm in App Store Connect that the two subscriptions' base region price is the GBP tier you intend, and that GBP appears in the price schedule.
