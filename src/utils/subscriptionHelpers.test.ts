import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSubscriptionAccess } from './subscriptionHelpers';

describe('resolveSubscriptionAccess', () => {
  const now = new Date('2026-07-20T10:00:00.000Z');
  const future = new Date('2026-08-20T10:00:00.000Z').toISOString();
  const past = new Date('2026-06-20T10:00:00.000Z').toISOString();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows active monthly and annual subscriptions with a future period end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(resolveSubscriptionAccess({
      subscription_status: 'active',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: future,
    })).toBe('allow');

    expect(resolveSubscriptionAccess({
      subscription_status: 'active',
      subscription_tier: 'annual_pro',
      subscription_current_period_end: future,
    })).toBe('allow');
  });

  it('blocks an active subscription when the recorded period end is already past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(resolveSubscriptionAccess({
      subscription_status: 'active',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: past,
    })).toBe('block');
  });

  it('still allows active subscriptions when Stripe has not populated a period end yet', () => {
    expect(resolveSubscriptionAccess({
      subscription_status: 'active',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: null,
    })).toBe('allow');
  });

  it('blocks explicit invalid subscription states', () => {
    expect(resolveSubscriptionAccess({
      subscription_status: 'past_due',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: future,
    })).toBe('block');

    expect(resolveSubscriptionAccess({
      subscription_status: 'canceled',
      subscription_tier: 'none',
    })).toBe('block');
  });
});
