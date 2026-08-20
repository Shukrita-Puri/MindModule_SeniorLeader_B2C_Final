/**
 * The paywall has exactly two purchase states, decided by StoreKit eligibility:
 *
 *  1. First-time user — Apple returns an eligible 7-day free-trial intro offer:
 *     orange "7-day free trial then £X/period" line + "Start 7-day free trial" CTA.
 *  2. Trial already used — no intro offer: no trial line, "Subscribe Monthly" /
 *     "Subscribe Annual" CTAs.
 *
 * Both states must render GBP and never a "$" amount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { IapProduct } from '@/services/iap';

const loadIapProductsWithDiagnostics = vi.fn();

vi.mock('@/services/iap', () => ({
  loadIapProductsWithDiagnostics: (...a: unknown[]) => loadIapProductsWithDiagnostics(...a),
  describeIapLoadDiagnostics: () => '',
  looksLikeAppStoreConnectIssue: () => false,
  purchaseIapProduct: vi.fn(),
  restoreIapPurchases: vi.fn(),
  openAppleManageSubscriptions: vi.fn(),
  onIapTransactionUpdate: vi.fn(async () => () => {}),
}));

import { ApplePaywall } from '@/components/subscription/ApplePaywall';

const monthly: IapProduct = {
  id: 'me.mindmodule.pro.monthly',
  title: 'Mind Module Pro Monthly',
  description: 'Monthly',
  displayPrice: '£34.99',
  price: 34.99,
  currencyCode: 'GBP',
  periodUnit: 'month',
  periodValue: 1,
};

const annual: IapProduct = {
  id: 'me.mindmodule.pro.annual',
  title: 'Mind Module Pro Annual',
  description: 'Annual',
  displayPrice: '£299.99',
  price: 299.99,
  currencyCode: 'GBP',
  periodUnit: 'year',
  periodValue: 1,
};

const withTrial = (p: IapProduct): IapProduct => ({
  ...p,
  isEligibleForIntroOffer: true,
  introOffer: {
    displayPrice: '£0.00',
    paymentMode: 'freeTrial',
    periodUnit: 'day',
    periodValue: 7,
    periodCount: 1,
  },
});

async function renderPaywall(products: IapProduct[]) {
  loadIapProductsWithDiagnostics.mockResolvedValue({
    products,
    diagnostics: { outcome: 'ok' },
  });
  const view = render(
    <MemoryRouter>
      <ApplePaywall user={null} onEntitled={() => {}} onRefreshProfile={async () => {}} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId('apple-plan-me.mindmodule.pro.monthly')).toBeTruthy());
  return view;
}

beforeEach(() => {
  cleanup();
  loadIapProductsWithDiagnostics.mockReset();
});

describe('first-time user (eligible for the 7-day introductory offer)', () => {
  it('shows the trial line and trial CTA on both plans, in GBP', async () => {
    const { container } = await renderPaywall([withTrial(monthly), withTrial(annual)]);

    expect(screen.getByTestId('apple-trial-me.mindmodule.pro.monthly').textContent)
      .toBe('7-day free trial then £34.99/month');
    expect(screen.getByTestId('apple-trial-me.mindmodule.pro.annual').textContent)
      .toBe('7-day free trial then £299.99/year');

    expect(screen.getAllByRole('button', { name: 'Start 7-day free trial' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Subscribe Monthly' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Subscribe Annual' })).toBeNull();

    const text = container.textContent ?? '';
    expect(text).toContain('£34.99');
    expect(text).toContain('£299.99');
    expect(text).not.toContain('$');
  });
});

describe('user who already used the trial (ineligible)', () => {
  it('shows no trial copy and falls back to Subscribe CTAs, still in GBP', async () => {
    const { container } = await renderPaywall([monthly, annual]);

    expect(screen.queryByTestId('apple-trial-me.mindmodule.pro.monthly')).toBeNull();
    expect(screen.queryByTestId('apple-trial-me.mindmodule.pro.annual')).toBeNull();
    expect(container.textContent).not.toContain('free trial then');

    expect(screen.getByRole('button', { name: 'Subscribe Monthly' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subscribe Annual' })).toBeTruthy();

    const text = container.textContent ?? '';
    expect(text).toContain('£34.99');
    expect(text).toContain('£299.99');
    expect(text).not.toContain('$');
  });

  it('drops trial copy when Apple reports the Apple ID is ineligible', async () => {
    await renderPaywall([
      { ...withTrial(monthly), isEligibleForIntroOffer: false },
      { ...withTrial(annual), isEligibleForIntroOffer: false },
    ]);
    expect(screen.queryByTestId('apple-trial-me.mindmodule.pro.monthly')).toBeNull();
    expect(screen.getByRole('button', { name: 'Subscribe Monthly' })).toBeTruthy();
  });
});
