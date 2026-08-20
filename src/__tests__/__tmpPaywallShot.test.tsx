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


import { writeFileSync } from 'node:fs';

describe('dump', () => {
  it('writes both states to /tmp', async () => {
    const a = await renderPaywall([withTrial(monthly), withTrial(annual)]);
    writeFileSync('/tmp/browser/paywall/first-time.html', a.container.innerHTML);
    cleanup();
    loadIapProductsWithDiagnostics.mockReset();
    const b = await renderPaywall([monthly, annual]);
    writeFileSync('/tmp/browser/paywall/post-trial.html', b.container.innerHTML);
  });
});
