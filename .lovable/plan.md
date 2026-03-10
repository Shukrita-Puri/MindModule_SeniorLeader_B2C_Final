

# Subscription, Stripe & Usage-Gate Audit

---

## 1. Stripe Integration

### Status: Implemented but NOT LIVE

**Secrets status** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the 4 Price IDs (`STRIPE_PRICE_GBP_MONTHLY`, `STRIPE_PRICE_GBP_ANNUAL`, `STRIPE_PRICE_USD_MONTHLY`, `STRIPE_PRICE_USD_ANNUAL`) are **NOT in the secrets list**. Only application secrets (Auth0, APNS, Google Calendar, etc.) are configured. This means all Stripe Edge Functions will fail at runtime with "Stripe not configured" errors.

**Edge Functions — all 4 exist and are fully coded:**

| Function | Purpose | Auth |
|---|---|---|
| `create-checkout-session` | Creates Stripe Checkout with 7-day trial, referral code validation, GBP/USD price selection | Auth0 JWT |
| `stripe-webhook` | Processes 5 Stripe events (see Section 3), updates profiles, handles referral attribution | Stripe signature |
| `create-customer-portal` | Opens Stripe Billing Portal for managing payment methods, invoices | Auth0 JWT via `authenticateRequest` |
| `cancel-subscription` | Cancels at period end (or immediately), saves feedback | Auth0 JWT |

---

## 2. Database Structure

### `profiles` table — Subscription columns (all present, verified in DB):

| Column | Type | Default | Purpose |
|---|---|---|---|
| `stripe_customer_id` | text | null | Stripe customer reference |
| `stripe_subscription_id` | text | null | Stripe subscription reference |
| `subscription_status` | text | null | trialing / active / past_due / canceled |
| `subscription_tier` | text | 'none' | none / trial / monthly_pro / annual_pro |
| `subscription_plan` | text | null | (appears unused — tier is authoritative) |
| `subscription_currency` | text | 'USD' | GBP or USD |
| `subscription_current_period_start` | timestamptz | null | From Stripe |
| `subscription_current_period_end` | timestamptz | null | From Stripe |
| `subscription_cancel_at` | timestamptz | null | Scheduled end date (set on cancel) |
| `subscription_canceled_at` | timestamptz | null | Actual deletion timestamp |
| `trial_ends_at` | timestamptz | null | 7-day trial end |
| `referral_code_used` | text | null | Code entered at checkout |
| `referral_code_entered_at` | timestamptz | null | When code was entered |

### Supporting tables (all exist):

| Table | Columns | Purpose |
|---|---|---|
| `subscription_events` | user_id, event_type, from_tier, to_tier, stripe_event_id, stripe_event_type, metadata, created_at | Audit log of all subscription lifecycle events |
| `cancellation_feedback` | user_id, reason, reason_details, retention_offer_shown, retention_offer_accepted, canceled_at | Cancellation survey responses |
| `dialogue_sessions` | (exists) | Used by `check-coach-access` to count trial usage |

**Subscription state is driven entirely by Stripe webhooks** — all profile subscription fields are written by `stripe-webhook`, not client-side logic.

---

## 3. Stripe Webhook Handling

### Status: Fully implemented, handles 5 events

| Event | Action |
|---|---|
| `checkout.session.completed` | Sets tier='trial', status='trialing', trial_ends_at=+7d, stores stripe_subscription_id. Handles referral attribution (metadata + custom_fields). |
| `customer.subscription.updated` | When status='active': sets tier to monthly_pro/annual_pro, clears trial_ends_at, sets period dates. Handles referral conversion credits (Stripe balance credit + DB extend). |
| `invoice.payment_succeeded` | Logs event to subscription_events. Does NOT update profile fields. |
| `invoice.payment_failed` | Sets subscription_status='past_due'. Logs event. |
| `customer.subscription.deleted` | Sets tier='none', status='canceled', subscription_canceled_at=now(). |

**Gap**: `customer.subscription.created` is NOT handled (not needed since `checkout.session.completed` covers initial setup).

**Gap**: `invoice.payment_succeeded` does NOT update `subscription_current_period_end`. On recurring renewals, the period end only updates via `customer.subscription.updated`.

---

## 4. Usage Gates / Paywall Logic

### Components that exist:

| Component | Status | Wired? |
|---|---|---|
| `SubscriptionGuard` | **DISABLED** — pass-through (`return <>{children}</>`) | Wraps ALL protected routes in App.tsx (coach, insights, profile, etc.) but does nothing |
| `UpgradeModal` | Fully built UI (sessions remaining, feature list, upgrade button → `/onboarding/payment`) | **NOT imported or used anywhere** except its own file |
| `check-coach-access` | Fully built Edge Function — checks tier, counts dialogue_sessions, returns canStart/sessionsRemaining | **NOT called from any frontend component** |
| `CancellationFlow` | Fully built and wired into Profile.tsx | Working (calls cancel-subscription) |

**Summary**: The usage-gating components exist but are completely disconnected:
- The Coach page does NOT call `check-coach-access` before starting sessions
- The `UpgradeModal` is never shown to users
- `SubscriptionGuard` is a no-op
- Insight cards have no feature gates

---

## 5. Profile / Billing UI

### Status: Fully implemented in `Profile.tsx`

**Subscription display:**
- Plan label: maps tier to human names (7 Day Trial, Monthly Pro, Annual Pro)
- Status label: Free / Paid / Canceled
- Expiry label: dynamic based on state (trial end, renewal date, access-until, access-ended)

**Actions available via dropdown menu:**

| Action | Condition | Implementation |
|---|---|---|
| Manage Billing | Always visible | Opens Stripe Portal (if `isPaying`) or redirects to `/onboarding/payment` |
| Cancel Plan | `!isCanceled && !isPendingCancellation` | Opens `CancellationFlow` modal |
| Upgrade (implicit) | When not paying | "Manage Billing" redirects to payment page |

**Missing**: No explicit "Change Plan" (monthly↔annual) button — this is handled within the Stripe Billing Portal.

---

## 6. Cancellation Flow

### Status: Fully implemented

- `CancellationFlow` component: 6 reason options + optional free-text feedback
- Retention-first design: "Keep current plan" is primary CTA, "Cancel plan" is secondary
- Calls `cancel-subscription` Edge Function which:
  - Sets `cancel_at_period_end: true` in Stripe (NOT immediate by default)
  - Saves `subscription_cancel_at` (period end date) to profiles
  - Saves feedback to `cancellation_feedback` table
- Actual deletion happens when Stripe fires `customer.subscription.deleted` (sets tier='none')

---

## 7. Beta Tester Flow

### Status: Implicit, not explicit

- **No `beta_user` flag** exists in the database
- **`ADMIN_SUBS_CSV`** secret exists — used only in `certificate-requests-admin-list` for admin access, NOT for subscription bypass
- **`SubscriptionGuard` is disabled** — this is the de facto beta bypass. All users pass through regardless of subscription state
- **Onboarding can bypass `/onboarding/payment`** — the OnboardingFlow skips gating for the payment page, and since SubscriptionGuard is a no-op, users can complete onboarding without paying
- **`DEV_MODE`** in `src/config/devMode.ts` provides mock subscription data but is set to `false`

There is no structured beta-tester system. The current bypass is simply "SubscriptionGuard is turned off."

---

## 8. Architecture Summary

### Fully Implemented
- Database schema (all subscription columns on profiles, subscription_events, cancellation_feedback)
- All 4 Stripe Edge Functions (checkout, webhook, portal, cancel)
- Webhook handler for 5 Stripe events with referral attribution
- Profile page billing UI with plan display, manage billing, and cancel flow
- CancellationFlow component with feedback collection
- `check-coach-access` Edge Function with trial session counting

### Partially Implemented
- `SubscriptionGuard` — exists and wraps all routes, but is disabled (pass-through)
- `UpgradeModal` — fully built UI but never imported/used anywhere
- Coach usage gating — backend exists (`check-coach-access`) but frontend never calls it

### Missing / Not Configured
- **Stripe secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and 4 Price IDs are NOT set — entire Stripe integration will fail at runtime
- **Stripe webhook endpoint**: No evidence the webhook URL is registered in the Stripe dashboard
- **Frontend → check-coach-access wiring**: Coach page needs to call the endpoint and conditionally show UpgradeModal
- **Insight card feature gates**: No gating exists for insights
- **Beta tester flag/system**: No structured mechanism — relies on disabled SubscriptionGuard
- **Subscription expiry enforcement**: When trial_ends_at passes with no payment, nothing downgrades the user (no cron job or Stripe event handles trial expiry without checkout)

