/**
 * Subscription helper utilities — CANONICAL access check.
 * 
 * hasValidAccess() is the SINGLE source of truth for subscription/beta gating.
 * Used by: SubscriptionGuard, Front.tsx CTA, any routing/access logic.
 * 
 * DO NOT duplicate this logic elsewhere.
 */

import { getAuthToken } from '@/services/authTokenService';

interface AccessUser {
  subscription_status?: string;
  subscription_tier?: string;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_canceled_at?: string | null;
  beta_user?: boolean;
  beta_expires_at?: string | null;
}

/**
 * Canonical access check — returns true if user should have app access.
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
  if (!user) return false;

  // 1. Beta access
  if (user.beta_user && user.beta_expires_at) {
    if (new Date(user.beta_expires_at) > new Date()) return true;
  }

  const status = user.subscription_status;

  // 2. Active subscription — always allowed
  if (status === 'active') return true;

  // 3. Trialing subscription
  if (status === 'trialing') {
    const tier = user.subscription_tier;
    // Paid-tier Stripe billing trial → full access (no local expiry check)
    if (tier === 'monthly_pro' || tier === 'annual_pro') return true;
    // App-level free trial — check trial_ends_at if present
    if (user.trial_ends_at) {
      return new Date(user.trial_ends_at) > new Date();
    }
    // No trial_ends_at but status is trialing → allow (don't false-block)
    return true;
  }

  // 4. Legacy 'trial' status
  if (status === 'trial' && user.trial_ends_at) {
    return new Date(user.trial_ends_at) > new Date();
  }

  return false;
}

// Backwards-compatible alias — callers that used the old name keep working
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
