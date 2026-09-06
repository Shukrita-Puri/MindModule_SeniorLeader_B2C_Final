import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveManageSubscriptionTarget, resolveSubscriptionAccess, isFirstTimeUser } from './subscriptionHelpers';


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

  it('allows an active beta tester even when subscription fields are explicitly none', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const betaUser = {
      beta_user: true,
      beta_expires_at: future,
      subscription_status: 'none',
      subscription_tier: 'none',
    };

    expect(resolveSubscriptionAccess(betaUser)).toBe('allow');
    expect(resolveManageSubscriptionTarget(betaUser)).toBe('payment_page');
  });

  it('blocks an expired beta tester without another valid entitlement', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(resolveSubscriptionAccess({
      beta_user: true,
      beta_expires_at: past,
      subscription_status: 'none',
      subscription_tier: 'none',
    })).toBe('block');
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

describe('isFirstTimeUser', () => {
  it('returns true for a clean new profile with no trial or subscription history', () => {
    expect(isFirstTimeUser({
      subscription_status: 'none',
      subscription_tier: 'none',
    })).toBe(true);

    expect(isFirstTimeUser({})).toBe(true);
  });

  it('returns false when a trial has ever been started', () => {
    expect(isFirstTimeUser({
      trial_ends_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      subscription_status: 'none',
      subscription_tier: 'none',
    })).toBe(false);
  });

  it('returns false when a subscription has existed or ended', () => {
    expect(isFirstTimeUser({
      subscription_status: 'canceled',
      subscription_tier: 'none',
      subscription_canceled_at: new Date().toISOString(),
    })).toBe(false);

    expect(isFirstTimeUser({
      subscription_status: 'expired',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    })).toBe(false);
  });

  it('returns false for a valid beta user', () => {
    expect(isFirstTimeUser({
      beta_user: true,
      beta_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      subscription_status: 'none',
      subscription_tier: 'none',
    })).toBe(false);
  });
});

