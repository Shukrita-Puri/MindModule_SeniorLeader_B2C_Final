/**
 * Subscription helper utilities for checking valid subscriptions
 * and managing re-entry logic (60-day rule).
 */

import { getAuthToken } from '@/services/authTokenService';

interface SubscriptionUser {
  subscription_tier?: string;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_canceled_at?: string | null;
}

/**
 * Check if a user has a valid (non-expired) subscription.
 */
export function hasValidSubscription(user: SubscriptionUser | null): boolean {
  if (!user) return false;

  const tier = user.subscription_tier;
  if (!tier || tier === 'none') return false;

  if (tier === 'trial' && user.trial_ends_at) {
    return new Date(user.trial_ends_at) > new Date();
  }

  // monthly_pro or annual_pro — check period end
  if (tier === 'monthly_pro' || tier === 'annual_pro') {
    if (user.subscription_current_period_end) {
      return new Date(user.subscription_current_period_end) > new Date();
    }
    // If no period end set, treat as active
    return true;
  }

  return false;
}

/**
 * Check if user canceled within the last 60 days.
 */
export function isWithin60DaysOfCancellation(user: SubscriptionUser | null): boolean {
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
