import { describe, it, expect } from 'vitest';
import {
  describeTrial,
  describeIntroDiscount,
  isEligibleFreeTrial,
  billingFrequencyLabel,
} from '@/utils/introOffer';
import type { IapProduct } from '@/services/iap';

const base: IapProduct = {
  id: 'com.mindmodule.pro.monthly',
  title: 'Mind Module Pro Monthly',
  description: 'Monthly',
  displayPrice: '£12.99',
  price: 12.99,
  currencyCode: 'GBP',
  periodUnit: 'month',
  periodValue: 1,
};

const sevenDayTrial: IapProduct = {
  ...base,
  isEligibleForIntroOffer: true,
  introOffer: {
    displayPrice: '£0.00',
    paymentMode: 'freeTrial',
    periodUnit: 'day',
    periodValue: 7,
    periodCount: 1,
  },
};

describe('Apple introductory offer presentation', () => {
  it('renders 7-day free trial copy from StoreKit data only', () => {
    const t = describeTrial(sevenDayTrial);
    expect(t.isFreeTrial).toBe(true);
    expect(t.headline).toBe('7-day free trial');
    expect(t.postTrialLine).toBe('then £12.99 per month');
    expect(t.ctaLabel).toBe('Start 7-day free trial');
    expect(t.disclosure).toMatch(/renews|converts/i);
    expect(t.disclosure).toMatch(/cancel/i);
  });

  it('shows no trial copy when Apple returns no intro offer', () => {
    const t = describeTrial(base);
    expect(t.isFreeTrial).toBe(false);
    expect(t.headline).toBeNull();
    expect(t.postTrialLine).toBeNull();
    expect(t.ctaLabel).toBe('Subscribe');
  });

  it('shows no trial copy when the Apple ID is ineligible', () => {
    const t = describeTrial({ ...sevenDayTrial, isEligibleForIntroOffer: false });
    expect(t.isFreeTrial).toBe(false);
    expect(t.ctaLabel).toBe('Subscribe');
    expect(describeIntroDiscount({ ...sevenDayTrial, isEligibleForIntroOffer: false })).toBeNull();
  });

  it('never calls a paid introductory price a free trial', () => {
    const discounted: IapProduct = {
      ...base,
      isEligibleForIntroOffer: true,
      introOffer: {
        displayPrice: '£4.99',
        paymentMode: 'payUpFront',
        periodUnit: 'month',
        periodValue: 3,
        periodCount: 1,
      },
    };
    expect(isEligibleFreeTrial(discounted)).toBe(false);
    expect(describeTrial(discounted).isFreeTrial).toBe(false);
    expect(describeIntroDiscount(discounted)).toBe('Introductory offer: £4.99 for 3-month period');
  });

  it('uses the localized price and period Apple returned, never a hardcoded one', () => {
    const annual: IapProduct = {
      ...sevenDayTrial,
      id: 'com.mindmodule.pro.annual',
      displayPrice: '¥14,800',
      periodUnit: 'year',
      periodValue: 1,
    };
    const t = describeTrial(annual);
    expect(t.postTrialLine).toBe('then ¥14,800 per year');
    expect(billingFrequencyLabel(annual)).toBe('per year');
  });

  it('derives trial length from Apple period data, not a constant', () => {
    const fourteen = describeTrial({
      ...sevenDayTrial,
      introOffer: { ...sevenDayTrial.introOffer!, periodValue: 14 },
    });
    expect(fourteen.headline).toBe('14-day free trial');
  });

  it('handles a trial expressed as 1 week', () => {
    const weekly = describeTrial({
      ...sevenDayTrial,
      introOffer: { ...sevenDayTrial.introOffer!, periodUnit: 'week', periodValue: 1 },
    });
    expect(weekly.headline).toBe('1-week free trial');
  });

  it('treats an undefined eligibility flag (older native build) as offer-driven', () => {
    const legacy = { ...sevenDayTrial, isEligibleForIntroOffer: undefined };
    expect(isEligibleFreeTrial(legacy)).toBe(true);
  });
});