

# Pricing & Subscription Implementation Plan

This is a large, multi-layered feature spanning UI, database, Stripe integration, edge functions, and usage gating. Here is the full implementation plan.

---

## Prerequisites

**Enable Stripe Integration** via the Lovable Stripe tool. This will:
- Collect the Stripe secret key
- Expose Stripe-specific tools for creating products/prices
- Provide the infrastructure for checkout sessions and webhooks

**Required Secrets** (after Stripe is enabled):
- `STRIPE_SECRET_KEY` (from Stripe Dashboard)
- `STRIPE_WEBHOOK_SECRET` (from Stripe webhook endpoint config)
- `STRIPE_PRICE_GBP_MONTHLY`, `STRIPE_PRICE_GBP_ANNUAL`, `STRIPE_PRICE_USD_MONTHLY`, `STRIPE_PRICE_USD_ANNUAL` (price IDs created in Stripe)
- `APP_URL` / `FRONTEND_URL` (already exists as a secret)

---

## 1. Database Schema Changes (Migration)

Add subscription columns to `profiles` table (it already has `subscription_status` and `subscription_plan`):

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_canceled_at timestamptz;
```

Create `subscription_events` and `cancellation_feedback` tables with service-role-only RLS (consistent with project's Auth0 pattern where all user data access goes through edge functions with service role key).

---

## 2. Payment Page UI Redesign (`src/pages/onboarding/stages/Stage6Payment.tsx`)

Complete rewrite of the payment page to be mobile-first with:

- **Remove** the "I'll decide later" link
- **Remove** the 3-tier card layout
- **Monthly/Annual toggle** defaulting to Annual
- **Single pricing tier**: $29/mo or $289/yr (save 17%)
- **7-day free trial banner** with feature highlights
- **Currency detection** (USD default, GBP for UK users via profile location or IP fallback)
- **"Start 7-Day Free Trial" CTA** that triggers Stripe Checkout
- **ROI justification section** and security/guarantee badges
- **PricingCard subcomponent** for the selected plan details

Note: `framer-motion` is not installed. Animations will use Tailwind CSS transitions and the existing `animate-fade-in` utility instead.

The CTA button will call the `create-checkout-session` edge function and redirect to Stripe Checkout.

---

## 3. Edge Functions

All edge functions follow the project's established patterns:
- Auth0 JWT verification via `_shared/auth.ts`
- CORS headers inline (no shared cors.ts file exists)
- `verify_jwt = false` in `config.toml`
- Service role key for DB access

### A. `create-checkout-session/index.ts`
- Authenticates user via Auth0 JWT
- Gets/creates Stripe customer
- Creates a Stripe Checkout Session with 7-day trial
- Returns `sessionId` for client-side redirect
- Success URL: `/onboarding/context-connection?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `/onboarding/payment`

### B. `stripe-webhook/index.ts`
- **No JWT auth** (Stripe signature verification instead)
- Handles events:
  - `checkout.session.completed` → set `subscription_status='trialing'`, `subscription_tier='trial'`
  - `customer.subscription.updated` → detect trial-to-paid conversion
  - `invoice.payment_succeeded` → log event
  - `invoice.payment_failed` → set `subscription_status='past_due'`
  - `customer.subscription.deleted` → set `subscription_status='canceled'`, `subscription_tier='none'`
- Logs all events to `subscription_events` table

### C. `cancel-subscription/index.ts`
- Auth0 JWT verification
- Cancels subscription at period end via Stripe API
- Saves cancellation feedback to `cancellation_feedback` table
- Returns end date

### D. `check-coach-access/index.ts`
- Auth0 JWT verification
- Checks `subscription_tier` and dialogue session count
- Returns `{ canStart, unlimited, sessionsRemaining, showWarning }`

---

## 4. Usage Gates

### Coach Conversation Limit
- Modify coach page to check access before starting sessions
- Trial users: 10 session limit
- Warning banner at sessions 8-9
- Upgrade modal at session 10
- Pro users: unlimited

### Locked Insights
- Create `LockedInsightSection` component showing blurred preview + "Unlock with Pro" CTA
- Modify insight cards (Self-Mastery Patterns, Momentum, etc.) to check `subscription_tier`
- Trial: show dimension scores + archetype, lock AI analysis/coach insights/recurring themes
- Pro: full access

---

## 5. Cancellation Flow (`src/pages/settings/BillingSettings.tsx` or new component)

- Reason selection (too expensive, not using, missing features, found alternative, other)
- Retention offers based on reason:
  - "Too expensive" → suggest annual plan switch
  - "Not using" → offer 30-day pause
- Confirm cancel → calls `cancel-subscription` edge function
- "Your access continues until end of billing period" messaging

---

## 6. Config Changes

Add to `supabase/config.toml`:
```toml
[functions.create-checkout-session]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false

[functions.cancel-subscription]
verify_jwt = false

[functions.check-coach-access]
verify_jwt = false
```

---

## 7. Files Created/Modified

| File | Action |
|------|--------|
| `src/pages/onboarding/stages/Stage6Payment.tsx` | Rewrite (new mobile-first pricing UI) |
| `supabase/functions/create-checkout-session/index.ts` | Create |
| `supabase/functions/stripe-webhook/index.ts` | Create |
| `supabase/functions/cancel-subscription/index.ts` | Create |
| `supabase/functions/check-coach-access/index.ts` | Create |
| `src/components/insights/LockedInsightSection.tsx` | Create |
| `src/components/subscription/UpgradeModal.tsx` | Create |
| `src/components/subscription/CancellationFlow.tsx` | Create |
| `supabase/config.toml` | Add 4 function entries |
| DB Migration | Add columns to profiles, create 2 new tables |

---

## Implementation Order

1. Enable Stripe via the Stripe tool + collect secrets
2. Run DB migration (add columns + new tables)
3. Create edge functions (checkout, webhook, cancel, check-access)
4. Rewrite payment page UI
5. Add usage gates (coach limit + locked insights)
6. Add cancellation flow

