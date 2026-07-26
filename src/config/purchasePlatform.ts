/**
 * Canonical purchase-platform resolution.
 *
 * App Store Review Guideline 3.1.1: on iOS/iPadOS the app must not expose ANY
 * purchase flow other than Apple In-App Purchase, and must not link out to an
 * external purchase mechanism. This module is the SINGLE source of truth for
 * "which purchase surface may this build show?". Everything that renders an
 * upgrade / checkout / billing-portal CTA must consult it.
 *
 * Web (browser, including iOS Safari on app.mindmodule.me) is unaffected —
 * Stripe remains the purchase path there.
 */
import { Capacitor } from '@capacitor/core';

export type PurchaseProvider = 'apple_iap' | 'stripe';

/** True only inside the native iOS/iPadOS Capacitor shell. */
export function isIosNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** True inside any native shell (iOS or Android). */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Which purchase provider this runtime is allowed to use.
 * iOS native → Apple IAP only. Everywhere else → Stripe.
 */
export function activePurchaseProvider(): PurchaseProvider {
  return isIosNativeShell() ? 'apple_iap' : 'stripe';
}

/**
 * Guard for every Stripe purchase CTA (checkout, "upgrade on the website",
 * billing-portal-as-a-way-to-buy). MUST be false inside the iOS shell.
 */
export function canShowStripePurchaseUi(): boolean {
  return activePurchaseProvider() === 'stripe';
}

/** Apple's own subscription-management deep link. */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL =
  'https://apps.apple.com/account/subscriptions';

/**
 * Existing Stripe subscribers using the iOS app keep their access, but must be
 * shown a read-only status message instead of any purchase or billing CTA.
 */
export function isNonApplePaidEntitlement(user: {
  subscription_provider?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.subscription_provider === 'apple') return false;
  return Boolean(
    user.subscription_provider === 'stripe' ||
      user.stripe_subscription_id ||
      user.stripe_customer_id,
  );
}