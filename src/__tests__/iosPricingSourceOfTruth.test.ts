/**
 * Apple Guideline 3.1.2 / 2.3.1 guard.
 *
 * Every surface reachable INSIDE the iOS shell must take its subscription
 * price from StoreKit (or state no price at all). A hardcoded currency amount
 * that drifts from the App Store price is both a review rejection risk and a
 * consumer-law problem.
 *
 * Stripe-only web surfaces are deliberately excluded: Stage6Payment renders
 * <ApplePaywall/> before any Stripe pricing UI, so its price table is
 * unreachable on iOS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** e.g. £29, $24.99, €349.99 */
const CURRENCY_AMOUNT = /[£$€]\s?\d/;

const IOS_VISIBLE_SURFACES = [
  'src/components/subscription/ApplePaywall.tsx',
  'src/components/subscription/AppleSubscriptionCard.tsx',
  'src/components/subscription/UpgradeModal.tsx',
  'src/utils/introOffer.ts',
  'src/services/iap.ts',
  'src/config/iapProducts.ts',
  'src/pages/Terms.tsx',
];

describe('no hardcoded subscription pricing on iOS-reachable surfaces', () => {
  it.each(IOS_VISIBLE_SURFACES)('%s states no currency amount', (file) => {
    expect(CURRENCY_AMOUNT.test(read(file))).toBe(false);
  });

  it('the paywall renders StoreKit displayPrice rather than its own copy', () => {
    const src = read('src/components/subscription/ApplePaywall.tsx');
    expect(src).toContain('displayPrice');
  });

  it('trial copy is derived from Apple intro-offer data only', () => {
    const src = read('src/utils/introOffer.ts');
    expect(src).toContain('freeTrial');
    // No baked-in duration: the "7-day" string must come from Apple's period.
    expect(/['"`]7[- ]day/i.test(src)).toBe(false);
  });
});
