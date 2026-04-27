/**
 * Subscription helper utilities – CANONICAL access check.
 * 
 * hasValidAccess() is the SINGLE source of truth for subscription/beta gating.
 * Used by: SubscriptionGuard, Front.tsx CTA, any routing/access logic.
 * 
 * DO NOT duplicate this logic elsewhere.
 */

import { getAuthToken } from '@/services/authTokenService';

export interface AccessUser {
  subscription_status?: string;
  subscription_tier?: string;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_canceled_at?: string | null;
  beta_user?: boolean;
  beta_expires_at?: string | null;
}

export type SubscriptionAccessDecision = 'allow' | 'block' | 'pending';

function hasResolvedSubscriptionState(user: AccessUser): boolean {
  return [
    user.subscription_status,
    user.subscription_tier,
    user.trial_ends_at,
    user.subscription_current_period_end,
    user.beta_user,
    user.beta_expires_at,
  ].some(value => value !== undefined && value !== null);
}

/**
 * Canonical access check – returns true if user should have app access.
 * 
 * Rules (in priority order):
 * 1. Valid beta access (beta_user + unexpired beta_expires_at)
 * 2. subscription_status === 'active' → always allowed
 * 3. subscription_status === 'trialing' → allowed (Stripe billing trial or app trial)
 *    - For app-level trials: also check trial_ends_at if present
 * 4. Legacy 'trial' status → allowed only if trial_ends_at is unexpired
 * 5. Everything else → blocked
 * 
 * Safety: if status is active/trialing but tier/period data is missing,
 * we ALLOW access (prefer not blocking valid users over false paywall).
 */
export function hasValidAccess(user: AccessUser | null): boolean {
  return resolveSubscriptionAccess(user) === 'allow';
}

/**
 * Canonical beta-access check. Returns true ONLY when the user is an active
 * beta participant whose beta period has not expired. Use this everywhere
 * (onboarding results, payment, subscription guard) instead of inline
 * `user.beta_user && new Date(user.beta_expires_at) > new Date()` checks.
 */
export function isValidBeta(user: AccessUser | null): boolean {
  if (!user?.beta_user || !user.beta_expires_at) return false;
  return new Date(user.beta_expires_at) > new Date();
}

export function resolveSubscriptionAccess(user: AccessUser | null): SubscriptionAccessDecision {
  if (!user) return 'pending';

  // 1. Beta access
  if (user.beta_user && user.beta_expires_at) {
    if (new Date(user.beta_expires_at) > new Date()) return 'allow';
  }

  const status = user.subscription_status;

  // 2. Active subscription – always allowed
  if (status === 'active') return 'allow';

  // 3. Trialing subscription
  if (status === 'trialing') {
    const tier = user.subscription_tier;
    // Paid-tier Stripe billing trial → full access (no local expiry check)
    if (tier === 'monthly_pro' || tier === 'annual_pro') return 'allow';
    // App-level free trial – check trial_ends_at if present
    if (user.trial_ends_at) {
      return new Date(user.trial_ends_at) > new Date() ? 'allow' : 'block';
    }
    // No trial_ends_at but status is trialing → allow (don't false-block)
    return 'allow';
  }

  // 4. Legacy 'trial' status
  if (status === 'trial' && user.trial_ends_at) {
    return new Date(user.trial_ends_at) > new Date() ? 'allow' : 'block';
  }

  // If subscription data hasn't been resolved yet, fail open.
  if (!hasResolvedSubscriptionState(user)) {
    return 'pending';
  }

  // Explicit invalid states should block.
  if (status === 'expired' || status === 'inactive' || status === 'canceled' || status === 'past_due' || status === 'none') {
    return 'block';
  }

  // Explicitly no subscription tier also blocks, but only once data is resolved.
  if (user.subscription_tier === 'none') {
    return 'block';
  }

  // Unknown partial state should not false-block valid users.
  return 'pending';
}

/**
 * Canonical onboarding-access decision. Mirrors `resolveSubscriptionAccess` but
 * is intended for the onboarding flow (results → payment → app-intro). It does
 * NOT introduce any new business logic – it just delegates to the same source
 * of truth and adds an explicit "skip payment" verdict for valid beta users so
 * that callers don't re-implement `isValidBeta(user)` locally.
 *
 * Verdicts:
 * - 'allow'        → access granted (active sub, trialing, or valid beta)
 * - 'needs_payment'→ user must hit the payment page before continuing
 * - 'pending'      → access state has not yet resolved (auth still loading or
 *                    profile fields not yet populated). Callers MUST NOT route
 *                    away while this is the verdict.
 */
export type OnboardingAccessDecision = 'allow' | 'needs_payment' | 'pending';

export function resolveOnboardingAccess(user: AccessUser | null): OnboardingAccessDecision {
  const sub = resolveSubscriptionAccess(user);
  if (sub === 'allow') {
    console.log('[onboardingAccess] ✅ allow — beta_user:', user?.beta_user,
      'beta_expires_at:', user?.beta_expires_at,
      'subscription_status:', user?.subscription_status,
      'subscription_tier:', user?.subscription_tier);
    return 'allow';
  }
  if (sub === 'pending') {
    console.log('[onboardingAccess] ⏳ pending — waiting on profile sync. user present:', !!user);
    return 'pending';
  }
  // sub === 'block' → user has no valid access path → must complete payment
  console.log('[onboardingAccess] 💳 needs_payment — beta_user:', user?.beta_user,
    'beta_expires_at:', user?.beta_expires_at,
    'subscription_status:', user?.subscription_status,
    'subscription_tier:', user?.subscription_tier);
  return 'needs_payment';
}

/**
 * Snapshot-shape variant of {@link resolveOnboardingAccess}. The onboarding
 * progress snapshot returned by the `onboarding-progress` edge function does
 * not carry the full subscription record – it only knows whether the user has
 * (a) reached the payment step (`payment_at`) and (b) valid beta access
 * (`beta_user` + `beta_expires_at`). This helper maps those two snapshot
 * fields onto an `AccessUser` shape and delegates to the SAME canonical
 * `resolveSubscriptionAccess` decision so route-level gating cannot diverge
 * from page-level gating.
 *
 * Why this is safe:
 * - `payment_at` is only stamped after a successful Stripe checkout return,
 *   so treating it as `subscription_status: 'active'` for routing purposes is
 *   strictly more conservative than the page-level check (which inspects the
 *   real status). It NEVER grants access the page would later block.
 * - Beta validity flows through `isValidBeta()` so the date comparison lives
 *   in exactly one place.
 * - If neither signal is present we return `'needs_payment'`, mirroring the
 *   profile-shape verdict for an unsubscribed user.
 *
 * Returns `'pending'` if the snapshot itself is missing – callers must defer
 * routing in that case rather than flashing the wrong screen.
 */
export interface OnboardingAccessSnapshot {
  payment_at?: string | null;
  beta_user?: boolean | null;
  beta_expires_at?: string | null;
}

export function resolveOnboardingAccessFromSnapshot(
  snapshot: OnboardingAccessSnapshot | null | undefined,
): OnboardingAccessDecision {
  if (!snapshot) return 'pending';

  const accessUser: AccessUser = {
    // Payment completion in the onboarding row is treated as an active
    // subscription for routing purposes only. Page-level gating still
    // re-validates against the real profile.
    subscription_status: snapshot.payment_at ? 'active' : undefined,
    beta_user: snapshot.beta_user ?? undefined,
    beta_expires_at: snapshot.beta_expires_at ?? undefined,
  };

  return resolveOnboardingAccess(accessUser);
}

// Backwards-compatible alias – callers that used the old name keep working
export const hasValidSubscription = hasValidAccess;

/**
 * Check if user canceled within the last 60 days.
 */
export function isWithin60DaysOfCancellation(user: AccessUser | null): boolean {
  if (!user?.subscription_canceled_at) return false;

  const canceledAt = new Date(user.subscription_canceled_at);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  return canceledAt > sixtyDaysAgo;
}

/**
 * Call the reset-onboarding edge function to null out onboarding fields
 * and delete progress rows. Keeps the profile row for analytics.
 */
export async function resetIncompleteOnboarding(): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    console.warn('[subscriptionHelpers] No auth token, skipping reset');
    return;
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/reset-onboarding`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (res.ok) {
    console.log('[subscriptionHelpers] ✅ Onboarding reset successfully');
  } else {
    const body = await res.text();
    console.error('[subscriptionHelpers] ⚠️ Onboarding reset failed:', res.status, body);
  }
}
