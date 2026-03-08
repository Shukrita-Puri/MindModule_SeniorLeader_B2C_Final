

# Plan: Profile Name Editing, Subscription Data Accuracy, Security Fixes, and E2E Verification

## What's Already Done (No Changes Needed)
- **`finalPhrase` persistence bug**: Already fixed in a previous session. Line 679 of `compute-outer-readiness/index.ts` correctly stores `finalPhrase`, not `theme.phrase`.
- **Security scan on scoring logic**: Confirmed zero client-side scoring functions. `getFeltStateScore`, `getCircadianScore`, `getWearableScore`, `tierFallbacks` return no matches in `src/`. All proprietary logic is server-side only.

---

## Changes Required

### 1. Add "Preferred Name" Editing to Profile Page

**Problem**: The profile page displays the name from Auth0 (e.g., "S P") with no way to change it. Users want to set the name the app refers to them by.

**Approach**: 
- Add an `update-profile` edge function that accepts `{ full_name }` from the authenticated user and updates the `profiles` table server-side (using service role to bypass RLS, but verifying Auth0 JWT for identity).
- Update `Profile.tsx` to show an inline edit button next to the name. Clicking it opens a small dialog/input where the user types their preferred name, saves via the edge function, then calls `refreshProfile()` to update the `AppUser` state.
- The `profiles.full_name` column already exists and is nullable TEXT — no migration needed.

**Files**:
- Create `supabase/functions/update-profile/index.ts` — accepts `{ full_name }`, verifies Auth0 JWT, updates `profiles.full_name` via service role, returns updated profile.
- Edit `src/pages/Profile.tsx` — add edit name UI with dialog, call the new edge function, then call `refreshProfile()`.

### 2. Connect Plan Name to Actual Subscription Tier

**Problem**: Profile page shows hardcoded fallbacks (`'Premium'` for plan, `'Active'` for status) that don't reflect reality. The user in the screenshot shows "Trial" status and "Monthly" plan, but these come from `subscription_status` and `subscription_plan` fields which are set during sync-profile. The `subscription_tier` field (the authoritative source from Stripe) is available but not used in the profile display.

**Approach**:
- Map `subscription_tier` to human-readable labels: `none` → "Free", `trial` → "Trial", `monthly_pro` → "Monthly Pro", `annual_pro` → "Annual Pro".
- Show expiry date: for `trial`, show `trial_ends_at`; for paid plans, show `subscription_current_period_end`.
- Add a "Renews on" or "Expires on" line below the Plan row.
- If subscription is canceled, show "Canceled" status with the access-end date.

**Files**:
- Edit `src/pages/Profile.tsx` — replace hardcoded plan/status with derived values from `user.subscription_tier`, `user.trial_ends_at`, `user.subscription_current_period_end`, `user.subscription_canceled_at`. Add a new row for renewal/expiry date.

### 3. Fix RLS Policies: `daily_themes`, `user_coach_insights`, `user_integrations`

**Problem**: Security scan found 3 tables with `USING(true)` / `WITH CHECK(true)` on ALL policies. These are labeled "Service role full access" but the condition `true` means ANY authenticated user (including anon) can read/write all rows, not just service role.

**Tables affected**:
| Table | Current Policy | Fix |
|---|---|---|
| `daily_themes` | `USING(true) WITH CHECK(true)` | `USING(auth.role() = 'service_role'::text)` |
| `user_coach_insights` | `USING(true) WITH CHECK(true)` | `USING(auth.role() = 'service_role'::text)` |
| `user_integrations` | `USING(true) WITH CHECK(true)` | `USING(auth.role() = 'service_role'::text)` |

Additionally, `daily_themes` needs a user SELECT policy so the client can read its own themes (used by `LeadershipPatternsCard`). `user_coach_insights` similarly needs a user SELECT policy.

**Migration SQL**:
- Drop the 3 overly permissive policies.
- Create replacement service-role-only ALL policies.
- Add user-scoped SELECT policies for `daily_themes` and `user_coach_insights`.

### 4. E2E Test on /executive-home

After implementation, use the browser tools to navigate to `/executive-home`, verify:
- The Outer Readiness Brief card renders with Lean On and Watch For text.
- Font sizes are correct (text-[13px]).
- The priority cascade is returning non-null values (leanOn/watchFor populated).

---

## Summary of Deliverables

| # | Task | Type |
|---|---|---|
| 1 | Create `update-profile` edge function | New file |
| 2 | Add name editing UI to Profile page | Edit |
| 3 | Show real subscription tier + expiry in Profile | Edit |
| 4 | Fix 3 overly permissive RLS policies | DB migration |
| 5 | Deploy edge functions | Deploy |
| 6 | E2E verify on /executive-home | Browser test |

