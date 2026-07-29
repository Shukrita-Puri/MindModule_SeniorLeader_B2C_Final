# App Store Review Guideline 3.1.1 — Compliance Report

**App:** Mind Module  
**Version:** 1.0 (55)  
**Date:** July 29, 2026  
**Status:** ✅ Fully compliant with Guideline 3.1.1

---

## Executive Summary

Mind Module implements **Apple In-App Purchase (StoreKit 2)** as the exclusive purchase mechanism inside the iOS/iPadOS app. All Stripe purchase surfaces are completely hidden from iOS users, and server-side guards prevent iOS clients from accessing web billing flows even if requested directly.

---

## Implementation Overview

### 1. Client-Side Architecture

#### Purchase Platform Detection (SSOT)
- **File:** `src/config/purchasePlatform.ts`
- **Function:** `isIosNativeShell()` — Detects iOS/iPadOS native app using Capacitor platform API
- **Function:** `canShowStripePurchaseUi()` — Returns `false` on iOS, `true` elsewhere
- **Function:** `activePurchaseProvider()` — Returns `'apple_iap'` on iOS, `'stripe'` elsewhere

#### iOS Purchase Flow
- **File:** `src/pages/onboarding/stages/Stage6Payment.tsx`
- **Logic:** Early return renders `<ApplePaywall>` before any Stripe pricing UI when `isIosNativeShell()` is true
- **Products:** Loaded from StoreKit at runtime (never hardcoded)
- **Prices:** Displayed exactly as returned by Apple (localized, with intro offers when eligible)

#### Apple Paywall Component
- **File:** `src/components/subscription/ApplePaywall.tsx`
- **Features:**
  - Displays monthly + annual plans from StoreKit
  - Shows intro offers (7-day free trial) only when Apple confirms eligibility
  - "Restore Purchases" always visible
  - "Manage Subscription" links to Apple's subscription settings
  - No external purchase links
  - Existing Stripe customers see read-only status (no repurchase prompt)

#### Profile/Settings
- **File:** `src/pages/Profile.tsx`
- **Logic:** 
  - All Stripe billing CTAs gated behind `canShowStripePurchaseUi()` check
  - iOS renders `<AppleSubscriptionCard>` instead
  - No "Manage Billing", "Cancel Plan", or "Upgrade" CTAs for Stripe visible on iOS

#### Upgrade Modal
- **File:** `src/components/subscription/UpgradeModal.tsx`
- **Logic:** Routes to `/upgrade` which renders Apple paywall on iOS

#### Legal Pages (Terms & Privacy)
- **Files:** `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`
- **Logic:** Stripe payment processor mentions are hidden on iOS; only Apple payment processing text is shown

---

### 2. Server-Side Guards

#### iOS Purchase Flow Rejection
- **File:** `supabase/functions/_shared/ios-purchase-guard.ts`
- **Function:** `rejectIosPurchaseFlow(req, corsHeaders)`
- **Logic:**
  - Detects iOS native callers via `x-mm-client-platform: native-ios` header
  - Returns 403 with code `ios_requires_iap` for iOS clients
  - Allows web (including mobile Safari) and Android

#### Protected Endpoints
All Stripe purchase/billing functions are protected:

1. **`create-checkout-session`** — Stripe checkout for web subscriptions
2. **`create-customer-portal`** — Stripe billing portal for managing subscriptions
3. **`cancel-subscription`** — Stripe subscription cancellation (NEW: protected as of July 29, 2026)

Each function:
- Imports `rejectIosPurchaseFlow`
- Calls it immediately after OPTIONS check
- Returns 403 to iOS callers before any Stripe API calls

#### Platform Header
- **File:** `src/services/authTokenService.ts`
- **Function:** `clientPlatformHeader()`
- **Header:** `x-mm-client-platform: native-ios` for iOS, `web` for browsers
- **Attached to:** All edge function calls via `getAuthHeaders()`

---

### 3. Entitlement Verification

#### Apple Transaction Verification
- **File:** `supabase/functions/verify-apple-purchase/index.ts`
- **Flow:**
  1. Client sends signed StoreKit transaction (JWS)
  2. Server verifies signature against Apple's x5c certificate chain
  3. Server calls App Store Server API to confirm transaction status
  4. Grants entitlement if valid

#### Automatic Entitlement Sync
- **File:** `src/App.tsx` → `IapEntitlementWatcher`
- **Triggers:**
  - App cold start
  - Foreground resume
  - StoreKit transaction updates (Ask to Buy, interrupted purchase, renewals)

---

### 4. Test Coverage

#### Compliance Test Suite
- **File:** `src/__tests__/guideline311PurchaseSurfaces.test.ts`
- **Coverage:**
  - ✅ iOS shell detection
  - ✅ Stripe UI gating on all screens
  - ✅ ApplePaywall never shows purchase CTA for entitled users
  - ✅ No web billing links in iOS subscription surfaces
  - ✅ Server-side guards on all Stripe endpoints
  - ✅ Platform header transmission

**Test Results:** 12/12 passing (verified July 29, 2026)

---

## What the Reviewer Will See on iOS

### On `/upgrade` (payment page):
1. **Loading state** (brief)
2. **Apple IAP paywall** with:
   - Two plans (Monthly Pro / Annual Pro)
   - Prices from StoreKit in reviewer's local currency
   - 7-day free trial offer (if eligible for reviewer's Apple ID)
   - "Subscribe to Mind Module Pro" buttons
   - "Restore Purchases" button
   - Privacy & Terms links
   - No Stripe UI
   - No external purchase links

### In Settings/Profile:
1. **Subscription section** showing:
   - Current plan status
   - iOS-native "Upgrade Plan" button → routes to Apple paywall
   - "Restore Purchases" button
   - "Manage Subscription" → opens Apple's subscription settings
   - No Stripe billing portal
   - No web links for payment management

### In Terms & Privacy:
- **Payment Processing section** mentions only Apple/App Store (Stripe references hidden on iOS)

---

## App Store Connect Configuration

### Required IAP Setup:
1. **Two Auto-Renewable Subscriptions** in one subscription group:
   - Monthly Pro (`com.mindmodule.monthly.pro` or configured product ID)
   - Annual Pro (`com.mindmodule.annual.pro` or configured product ID)

2. **Both products must be:**
   - Status: "Ready to Submit" or "Approved"
   - Included in binary submission for version 1.0 (55)
   - Have pricing configured for all storefronts
   - Have 7-day free trial introductory offer configured

3. **Subscription Group:**
   - Name: "Mind Module Pro"
   - One group containing both products

### Verification:
- ✅ Products created in App Store Connect
- ✅ StoreKit Configuration File (if using sandbox testing)
- ✅ Pricing set for all regions
- ⚠️ **CRITICAL:** Both products must be "Ready to Submit" when binary is submitted

---

## Changes Made for This Submission

### July 29, 2026 Updates:

1. **Added server-side guard to `cancel-subscription` function**
   - Prevents iOS clients from cancelling Stripe subscriptions
   - Apple subscribers must cancel via Apple's subscription management

2. **Updated Terms & Privacy pages**
   - Stripe payment processor text is now hidden on iOS
   - Only Apple/App Store payment processing information shown on iOS
   - Web users still see full Stripe information

3. **Updated test suite**
   - Added test coverage for `cancel-subscription` guard
   - All 12 tests passing

---

## Testing the IAP Flow

### Sandbox Testing:
1. Create a Sandbox Apple ID in App Store Connect
2. Sign into Settings → App Store (sandbox account)
3. Open Mind Module app
4. Navigate to `/upgrade`
5. Select a plan and tap "Subscribe"
6. Complete Apple's purchase confirmation
7. Verify entitlement grants immediately

### Production Testing:
1. Use real Apple ID with valid payment method
2. Free trial will be charged after 7 days unless cancelled
3. All functionality identical to sandbox

---

## Reviewer Notes

### Why the app was previously rejected:
The previous version exposed Stripe payment references in the Terms/Privacy pages visible inside the iOS app, even though the actual purchase flow was correctly gated. Apple interprets any mention of alternative payment methods as "accessing paid content by means other than IAP."

### What changed:
- All Stripe text in Terms/Privacy is now hidden on iOS
- Added server-side guard to the cancel subscription endpoint
- No other changes to the core purchase flow (which was already compliant)

### How to verify compliance:
1. Open the app on iPad Air (or any iOS device)
2. Navigate to any payment/upgrade surface
3. Confirm you ONLY see Apple IAP UI (no Stripe, no web links)
4. Navigate to Settings → Privacy Policy and Terms
5. Confirm payment section only mentions Apple/App Store
6. Test purchase flow with sandbox account
7. Verify entitlement grants successfully

---

## Contact Information

**Developer Contact:** support@mindmodule.me  
**Technical Questions:** Available via App Store Connect message thread

---

## Appendix: Code References

### Key Files for Review:
- `src/config/purchasePlatform.ts` — Purchase platform detection (SSOT)
- `src/pages/onboarding/stages/Stage6Payment.tsx` — Payment page (early return to Apple paywall)
- `src/components/subscription/ApplePaywall.tsx` — iOS-only purchase UI
- `src/pages/Profile.tsx` — Settings with iOS subscription management
- `src/pages/Terms.tsx` — Terms with iOS-specific payment text
- `src/pages/Privacy.tsx` — Privacy with iOS-specific payment text
- `supabase/functions/_shared/ios-purchase-guard.ts` — Server-side guard
- `src/__tests__/guideline311PurchaseSurfaces.test.ts` — Compliance test suite

### Native Plugin:
- `ios/App/App/InAppPurchasePlugin.swift` — StoreKit 2 bridge (Capacitor plugin)

---

**End of Report**
