

## Plan: Fix Critical Webhook Bug + Add Profile Storage for Referral Codes

### Problem

The `stripe-webhook` `checkout.session.completed` handler (line 84-86) **only** reads referral codes from Stripe `custom_fields`. It completely ignores `session.metadata.referralCode`, which is where `create-checkout-session` stores the validated code (line 127). This means referral codes passed from the app's payment page are silently discarded.

Additionally, `profiles` has no `referral_code_used` column, so there's no single source of truth for what code a referee used.

### What Changes

**1. Database Migration — Add 2 columns to `profiles`**

```sql
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS referral_code_used text,
  ADD COLUMN IF NOT EXISTS referral_code_entered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code_used 
  ON profiles(referral_code_used);
```

**2. Update `stripe-webhook/index.ts` — `checkout.session.completed` handler (lines 83-124)**

Replace the current referral block that only reads `custom_fields` with logic that:
- Extracts code from `session.metadata?.referralCode` first (app flow), falls back to `custom_fields` (Stripe-native flow)
- Normalizes to uppercase/trimmed
- Stores validated code in `profiles.referral_code_used` + `referral_code_entered_at`
- Then proceeds with existing attribution (find referrer, check duplicates, create `referral_conversions`, increment `total_signups`)

The `customer.subscription.updated` handler (lines 159-235) stays unchanged — it already correctly reads from `referral_conversions` for Stage 2 conversion credit.

**3. Update stale comments**

- `stripe-webhook` top comment (lines 7-10): Change "Two-stage" to "Payment-only" attribution
- `create-checkout-session` comment (lines 8-10): Remove reference to "Stage 1 at onboarding"
- `AuthCallback.tsx` comments (lines 124-125, 160-161): Update to say "payment-only" not "two-stage"

### Verification

All existing downstream connections remain intact:
- `create-checkout-session` → Stripe session with `metadata.referralCode` → ✅ now read by webhook
- Stripe custom_fields → ✅ still read as fallback
- `referral_conversions` table → ✅ unchanged schema, still written by webhook
- `increment_referral_stats` RPC → ✅ still called atomically
- `customer.subscription.updated` → reads `referral_conversions` → calls `credit_referrer_atomic` + `extend_subscription` → ✅ unchanged
- `Refer.tsx` → reads from `generate-referral-link` → ✅ unchanged
- `credit-referrer` edge function → ✅ still callable but currently called inline via RPC in webhook (not invoked as separate function from webhook — this is fine, the webhook does RPC directly)
- `track-referral-signup` → orphaned (no callers) but harmless — no change needed now

### Files Modified

| File | Change |
|------|--------|
| DB Migration | Add `referral_code_used` + `referral_code_entered_at` to `profiles` |
| `supabase/functions/stripe-webhook/index.ts` | Fix referral extraction to read metadata first, store in profiles |
| `supabase/functions/create-checkout-session/index.ts` | Update stale comment only |
| `src/pages/AuthCallback.tsx` | Update stale comments only |

