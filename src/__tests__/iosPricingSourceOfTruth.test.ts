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

/** Comments explain intent; only executable copy can mislead a user. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
    expect(CURRENCY_AMOUNT.test(stripComments(read(file)))).toBe(false);
  });

  it('the paywall renders StoreKit displayPrice rather than its own copy', () => {
    const src = read('src/components/subscription/ApplePaywall.tsx');
    expect(src).toContain('displayPrice');
  });

  it('trial copy is derived from Apple intro-offer data only', () => {
    const src = stripComments(read('src/utils/introOffer.ts'));
    expect(src).toContain("mode === 'freetrial'");
    expect(src).toContain('product.introOffer');
    // No baked-in duration: the "7-day" string must come from Apple's period.
    expect(/['"`]7[- ]day/i.test(src)).toBe(false);
  });
});

import { describeTrial } from '../utils/introOffer';
import type { IapProduct } from '../services/iap';

describe('dynamic intro offer button label generator', () => {
  it('correctly adapts button label to whatever trial period Apple returns', () => {
    const baseProduct: IapProduct = {
      id: 'me.mindmodule.pro.monthly',
      price: 34.99,
      displayPrice: '£34.99',
      currency: 'GBP',
      title: 'Mind Module Pro Monthly',
      description: 'Monthly Plan',
    };

    // 1. 7-Day Free Trial returned by Apple
    const p7Day: IapProduct = {
      ...baseProduct,
      isEligibleForIntroOffer: true,
      introOffer: {
        paymentMode: 'freeTrial',
        periodValue: 7,
        periodUnit: 'day',
        periodCount: 1,
        displayPrice: 'Free',
      },
    };
    expect(describeTrial(p7Day).ctaLabel).toBe('Start 7-day free trial');

    // 2. 14-Day Free Trial returned by Apple
    const p14Day: IapProduct = {
      ...baseProduct,
      isEligibleForIntroOffer: true,
      introOffer: {
        paymentMode: 'freeTrial',
        periodValue: 14,
        periodUnit: 'day',
        periodCount: 1,
        displayPrice: 'Free',
      },
    };
    expect(describeTrial(p14Day).ctaLabel).toBe('Start 14-day free trial');

    // 3. 30-Day Free Trial returned by Apple
    const p30Day: IapProduct = {
      ...baseProduct,
      isEligibleForIntroOffer: true,
      introOffer: {
        paymentMode: 'freeTrial',
        periodValue: 30,
        periodUnit: 'day',
        periodCount: 1,
        displayPrice: 'Free',
      },
    };
    expect(describeTrial(p30Day).ctaLabel).toBe('Start 30-day free trial');

    // 4. No Trial / Already used trial
    const pNoTrial: IapProduct = {
      ...baseProduct,
      isEligibleForIntroOffer: false,
    };
    expect(describeTrial(pNoTrial).ctaLabel).toBe('Subscribe');
  });
});
