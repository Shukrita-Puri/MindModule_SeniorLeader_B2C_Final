

# Implementation Plan

## 1. Create `supabase/functions/create-customer-portal/index.ts`

New edge function that:
- Authenticates via `authenticateRequest` (Auth0 JWT)
- Fetches `stripe_customer_id` from `profiles` using service role
- If no customer ID exists, returns 404 with "No billing account found"
- Creates a `stripe.billingPortal.sessions.create()` session
- Returns `{ portalUrl }` for the client to open

## 2. Update `supabase/config.toml`

Add entry:
```toml
[functions.create-customer-portal]
verify_jwt = false
```

## 3. Update `src/pages/Profile.tsx`

- Import `DialogDescription` and `ExternalLink` icon
- Add `managingPortal` state for loading
- Add `handleManageSubscription` function that calls the edge function and opens the portal URL via `window.open`
- In the Settings card, add a **"Manage Subscription"** button (always visible):
  - For users with a `stripe_customer_id` or paid tier: calls the portal function
  - For free/trial users without a Stripe customer: navigates to `/onboarding/payment`
- Add `DialogDescription` to the edit name dialog to fix the accessibility warning

## 4. Deploy `create-customer-portal`

Deploy via `supabase--deploy_edge_functions`, then test with `supabase--test_edge_functions`.

## Files Changed

| File | Action |
|---|---|
| `supabase/functions/create-customer-portal/index.ts` | Create |
| `supabase/config.toml` | Add function entry |
| `src/pages/Profile.tsx` | Add button + fix dialog |

