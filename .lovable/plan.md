
## Complete Profile Page Audit Findings & Fix Plan

After deep inspection of all Profile page code, edge functions, DB schema, migrations, auth flows, and live network logs, here is the full audit:

---

### DATA STORAGE ARCHITECTURE

All sensitive data is **server-side only** (Supabase `profiles` table). The frontend holds an in-memory mirror (`AppUser` state) populated by `sync-profile` on every login. No sensitive fields (Stripe IDs, subscription keys) are exposed in the React bundle or localStorage. LocalStorage only holds non-sensitive session flags (`native_auth_tokens` for iOS refresh, UI state flags).

---

### BUGS FOUND

**Bug 1 — Critical: `subscription_cancel_at` column never read by the frontend**

When a user clicks "Cancel Plan" in `CancellationFlow`, the `cancel-subscription` edge function writes `subscription_cancel_at` (future end date) to the DB. But:
- `AppUser` type has no `subscription_cancel_at` field
- `sync-profile` SELECT does not include `subscription_cancel_at`
- `isCanceled` only checks `subscription_canceled_at` (which is only set by Stripe webhook when the subscription is *actually* deleted, weeks later)

Result: After cancellation, the UI still shows "Cancel Plan" option and "Renews [date]" instead of "Access until [date]". The cancellation is invisble to the user.

There are two distinct columns:
- `subscription_cancel_at` = future date (when access ends) — set immediately by `cancel-subscription` function
- `subscription_canceled_at` = timestamp (when Stripe actually deleted it) — set by webhook at period end

**Bug 2 — Medium: `hasBillingAccount` always undefined for Stripe ID**

`(user as any)?.stripe_customer_id` — `stripe_customer_id` is never included in the `AppUser` type or returned by `sync-profile`. It's always `undefined`. The `any` cast silently masks this. The Portal button works by accident because `isPaying` covers it, but the logic is broken by design.

**Bug 3 — Medium: `DEV_USER` missing all subscription fields**

`devMode.ts` `DEV_USER` only has `subscription_status: "active"` and `subscription_plan: "monthly"` — none of the fields the Profile page reads (`subscription_tier`, `trial_ends_at`, `subscription_current_period_end`, `subscription_canceled_at`). If DEV_MODE is ever toggled on, the Profile page will render incorrect defaults and all buttons fail (edge functions reject the anon key as an invalid Auth0 JWT).

**Bug 4 — Low: Apple Watch "disconnect" is localStorage-only**

`handleDisconnectAppleWatch` removes `contextConnections` from localStorage. On next page load, `check-connections-status` re-queries `wearable_data` DB table and will show the watch as still connected if recent data exists. The disconnect is cosmetic-only.

---

### SECURITY ASSESSMENT — ALL CLEAR

- Every Profile mutation (rename, cancel, billing portal) routes through Auth0 JWT-verified edge functions using service role DB access. No direct client-to-DB writes.
- `profiles` table has RLS enabled with service_role-only write access and user-scoped SELECT.
- Stripe customer/subscription IDs never exposed in frontend state.
- `cancellation_feedback` table is service-role-only.
- Calendar tokens are AES-256-GCM encrypted; stored in `calendar_connections` with encrypted column references.
- `DEV_MODE = false` is confirmed in `devMode.ts`. No dev bypass active in production.
- Session token mismatch detection works (token sub vs auth0User sub cross-check in `useAuth`).

---

### FIXES TO IMPLEMENT

**1. `src/hooks/useAuth.tsx`**
- Add `subscription_cancel_at?: string | null` to `AppUser` interface
- Add it to the mapped user object in both `syncProfile` and `refreshProfile`

**2. `supabase/functions/sync-profile/index.ts`**
- Add `subscription_cancel_at` to the SELECT string (it's already a DB column from the migration)

**3. `src/pages/Profile.tsx`**
- Add `isPendingCancellation` = `!!user?.subscription_cancel_at && !isCanceled`
- Update `statusLabel`: Free / Paid / Canceled (unchanged — correct)
- Update `expiryLabel`: when `isPendingCancellation`, show "Access until [date]" using `subscription_cancel_at`; when `isCanceled`, show "Access ended"; when paying without cancel, show "Renews [date]"
- Hide "Cancel Plan" dropdown item when `isPendingCancellation || isCanceled`
- Remove the `(user as any)?.stripe_customer_id` cast — simplify `hasBillingAccount = isPaying`

**4. `src/config/devMode.ts`**
- Add all subscription fields to `DEV_USER` with realistic mock values so the profile page renders correctly if DEV_MODE is ever re-enabled

### Files Changed
```text
src/hooks/useAuth.tsx              -- Add subscription_cancel_at to AppUser + mappings
supabase/functions/sync-profile/   -- Add subscription_cancel_at to SELECT
src/pages/Profile.tsx              -- Fix pending-cancellation state + hasBillingAccount
src/config/devMode.ts              -- Add subscription fields to DEV_USER
```

No DB migration needed — `subscription_cancel_at` column already exists in the `profiles` table.
