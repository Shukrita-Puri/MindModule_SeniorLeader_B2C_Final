# Subscription entry points, paywall currency and layout

## 1. iOS end-to-end test for "Manage Subscription"
Add an iOS-specific companion to the existing routing test: with the platform mocked as native iOS, an active beta tester and an active monthly Pro user must land on the payment page (`/upgrade`, Stage6Payment) from both entry points:
- Profile → Subscription card ("Manage Subscription")
- Profile popover → "Subscription" item

The test asserts the Apple manage-subscriptions sheet is NOT opened for those two users, and stays navigation-only (no gating assertions). Annual Pro remains the control case that still opens Apple's native sheet.

## 2. Remove "Upgrade Plan" from the profile popover
`UserSettingsPopover` currently lists both "Upgrade Plan" (top group) and "Subscription" (bottom group). Drop the "Upgrade Plan" entry entirely so "Subscription" is the single route — on web and iOS alike. The Subscription item keeps today's behaviour: beta / monthly Pro go to the payment page, everyone else to the Profile subscription card. A guard test asserts the popover renders no "Upgrade Plan" item.

## 3. Currency on the payment page: GBP base
Per your answer, Apple's live StoreKit price stays authoritative (a UK Apple ID correctly shows £; the $299.99 in the screenshot is a US-region test account). The work here is to make GBP the base everywhere the app supplies the number itself:
- `ApplePaywall` fallback labels stay GBP and are aligned to the current GBP amounts used by the web pricing table (£29/month, £289/year), including the compliance-terms sentence which renders those labels.
- Web pricing in `Stage6Payment` is already GBP-only; the `USD` row in its price map is dead code and gets removed so no path can render `$`.
- Add a test asserting no `$`-prefixed price literal exists in the payment-page or paywall source.

## 4. Move "What's included" up
In `ApplePaywall`, relocate the WHAT'S INCLUDED block from below the plan cards to directly under the "Your mind runs everything. Now it has a chief of staff." header and above the first (Monthly Pro) plan card. Styling unchanged.

## Technical notes
- Files: `src/components/navigation/UserSettingsPopover.tsx`, `src/components/subscription/ApplePaywall.tsx`, `src/pages/onboarding/stages/Stage6Payment.tsx`, plus new/extended tests under `src/__tests__/`.
- No changes to `resolveSubscriptionAccess`, `SubscriptionGuard`, `resolveManageSubscriptionTarget`, IAP purchase/restore, or Stripe checkout.
