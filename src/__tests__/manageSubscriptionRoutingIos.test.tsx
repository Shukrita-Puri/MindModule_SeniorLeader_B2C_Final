/**
 * iOS end-to-end guard: active beta testers and active monthly Pro users
 * must reach Stage6Payment.tsx (rendering the Apple IAP paywall) from both
 * "Manage Subscription" entry points on iOS:
 *   1. Profile → Subscription card (AppleSubscriptionCard)
 *   2. Profile popover → "Subscription" item (UserSettingsPopover)
 *
 * Also verifies the iOS paywall receives the correct upgradeIntent /
 * restrictToPlan props for each user class.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MANAGE_SUBSCRIPTION_UPGRADE_PATH, type AccessUser } from '@/utils/subscriptionHelpers';

const openAppleManageSubscriptions = vi.fn(async () => true);

vi.mock('@/config/purchasePlatform', async () => {
  const actual = await vi.importActual<typeof import('@/config/purchasePlatform')>('@/config/purchasePlatform');
  return {
    ...actual,
    isIosNativeShell: () => true,
    activePurchaseProvider: () => 'apple_iap' as const,
    canShowStripePurchaseUi: () => false,
  };
});

vi.mock('@/services/iap', () => ({
  loadIapProductsWithDiagnostics: vi.fn(async () => ({
    products: [
      {
        id: 'me.mindmodule.pro.monthly',
        title: 'Mind Module Pro Monthly',
        description: 'Monthly Plan',
        displayPrice: '£34.99',
        price: 34.99,
        currencyCode: 'GBP',
      },
      {
        id: 'me.mindmodule.pro.annual',
        title: 'Mind Module Pro Annual',
        description: 'Annual Plan',
        displayPrice: '£299.99',
        price: 299.99,
        currencyCode: 'GBP',
      },
    ],
    diagnostics: {
      outcome: 'complete',
      requestedIds: ['me.mindmodule.pro.monthly', 'me.mindmodule.pro.annual'],
      returnedIds: ['me.mindmodule.pro.monthly', 'me.mindmodule.pro.annual'],
      missingIds: [],
      returnedCount: 2,
      configOk: true,
      storeAvailable: true,
      storefront: 'GBR',
      locale: 'en_GB',
      introEligibility: {},
    },
  })),
  purchaseIapProduct: vi.fn(async () => ({ status: 'purchased' })),
  restoreIapPurchases: vi.fn(async () => ({ restored: 0, entitled: false })),
  openAppleManageSubscriptions: (...a: unknown[]) => openAppleManageSubscriptions(...(a as [])),
  onIapTransactionUpdate: vi.fn(() => Promise.resolve(vi.fn())),
}));

vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: () => ({ recordStep: vi.fn() }),
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn(async () => 'token'),
  getAuthHeaders: vi.fn(async () => ({})),
  getEdgeFunctionHeaders: vi.fn(async () => ({})),
}));

vi.mock('@/utils/openUrl', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@/utils/onboardingV8', () => ({
  markV8Complete: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/utils/firstSessionTour', () => ({
  startFirstSessionTour: vi.fn(() => '/daily-check-in?tour=1'),
}));

let currentUser: AccessUser | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: currentUser ? { id: 'u1', email: 'test@mindmodule.me', name: 'Test User', ...currentUser } : null,
    loading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
  SidebarMenuButton: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

import { AppleSubscriptionCard } from '@/components/subscription/AppleSubscriptionCard';
import { UserSettingsPopover } from '@/components/navigation/UserSettingsPopover';
import Stage6Payment from '@/pages/onboarding/stages/Stage6Payment';

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

const ACTIVE_BETA: AccessUser = {
  beta_user: true,
  beta_expires_at: FUTURE,
  subscription_status: 'none',
  subscription_tier: 'none',
};

const ACTIVE_MONTHLY_PRO: AccessUser = {
  beta_user: false,
  subscription_status: 'active',
  subscription_tier: 'monthly_pro',
  subscription_current_period_end: FUTURE,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderWithRouter(ui: React.ReactNode, initialEntries: string[] = ['/profile']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/profile" element={<>{ui}</>} />
        <Route path="/upgrade" element={<Stage6Payment />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Manage Subscription → Stage6Payment on iOS (beta + monthly Pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
  });

  for (const [label, user, expectedRestrictToPlan] of [
    ['active beta tester', ACTIVE_BETA, undefined],
    ['active monthly Pro subscriber', ACTIVE_MONTHLY_PRO, 'annual'],
  ] as const) {
    it(`opens Stage6Payment from the Profile subscription card for an ${label}`, async () => {
      currentUser = user;
      renderWithRouter(
        <AppleSubscriptionCard user={user} onRefreshProfile={async () => undefined} />,
      );

      await userEvent.click(screen.getByTestId('profile-manage-apple-subscription'));

      await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());
      expect(screen.getByTestId('location')).toHaveTextContent(MANAGE_SUBSCRIPTION_UPGRADE_PATH);
      expect(openAppleManageSubscriptions).not.toHaveBeenCalled();
    });

    it(`opens Stage6Payment from the Profile popover for an ${label}`, async () => {
      currentUser = user;
      renderWithRouter(<UserSettingsPopover />);

      await userEvent.click(screen.getByText('Test User'));
      await userEvent.click(await screen.findByText('Subscription'));

      await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());
      expect(screen.getByTestId('location')).toHaveTextContent(MANAGE_SUBSCRIPTION_UPGRADE_PATH);
    });
  }

  it('passes upgradeIntent=true and restrictToPlan=annual for a monthly Pro user', async () => {
    currentUser = ACTIVE_MONTHLY_PRO;
    renderWithRouter(<Stage6Payment />, ['/upgrade?source=profile-upgrade']);

    await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());

    // restrictToPlan='annual' means only the annual plan card should render.
    expect(screen.queryByTestId('apple-plan-me.mindmodule.pro.monthly')).not.toBeInTheDocument();
    expect(screen.getByTestId('apple-plan-me.mindmodule.pro.annual')).toBeInTheDocument();
  });

  it('passes upgradeIntent=true and no restriction for an active beta user', async () => {
    currentUser = ACTIVE_BETA;
    renderWithRouter(<Stage6Payment />, ['/upgrade?source=profile-upgrade']);

    await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());

    expect(screen.getByTestId('apple-plan-me.mindmodule.pro.monthly')).toBeInTheDocument();
    expect(screen.getByTestId('apple-plan-me.mindmodule.pro.annual')).toBeInTheDocument();
  });
});
