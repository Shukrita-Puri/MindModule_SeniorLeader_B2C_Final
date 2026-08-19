/**
 * iOS end-to-end (component-level) guard: active beta testers and active monthly
 * Pro users must open Stage6Payment (which renders ApplePaywall) from BOTH
 * "Manage Subscription" entry points when running in the iOS native shell.
 *
 *   1. Profile → Subscription card (AppleSubscriptionCard)
 *   2. Profile popover → "Subscription" item (UserSettingsPopover)
 *
 * Navigation only — no gating logic is asserted or changed here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MANAGE_SUBSCRIPTION_UPGRADE_PATH, type AccessUser } from '@/utils/subscriptionHelpers';

const capturedPaywallProps: Array<Record<string, unknown>> = [];

vi.mock('@/config/purchasePlatform', () => ({
  isIosNativeShell: () => true,
  isNonApplePaidEntitlement: () => false,
}));

vi.mock('@/components/subscription/ApplePaywall', () => ({
  ApplePaywall: (props: Record<string, unknown>) => {
    capturedPaywallProps.push(props);
    return (
      <div
        data-testid="apple-paywall"
        data-upgrade-intent={String(props.upgradeIntent)}
        data-restrict-to-plan={props.restrictToPlan ?? ''}
      >
        Apple Paywall
      </div>
    );
  },
}));

const openAppleManageSubscriptions = vi.fn(async () => true);
vi.mock('@/services/iap', () => ({
  openAppleManageSubscriptions: (...a: unknown[]) => openAppleManageSubscriptions(...(a as [])),
  restoreIapPurchases: vi.fn(async () => ({ restored: 0, entitled: false })),
}));

vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: () => ({ recordStep: vi.fn() }),
}));

vi.mock('@/utils/onboardingV8', () => ({
  markV8Complete: vi.fn(async () => undefined),
}));

vi.mock('@/utils/firstSessionTour', () => ({
  startFirstSessionTour: vi.fn(),
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthHeaders: vi.fn(async () => ({})),
}));

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
  SidebarMenuButton: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

let currentUser: AccessUser | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: currentUser ? { id: 'u1', email: 'ios@mindmodule.me', name: 'iOS User', ...currentUser } : null,
    loading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(async () => undefined),
  }),
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

function renderAppTree() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route
          path="/profile"
          element={
            <>
              <AppleSubscriptionCard user={currentUser!} onRefreshProfile={async () => undefined} />
              <UserSettingsPopover />
            </>
          }
        />
        <Route path="/upgrade" element={<Stage6Payment />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('iOS Manage Subscription → Stage6Payment/ApplePaywall (beta + monthly Pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPaywallProps.length = 0;
    currentUser = null;
  });

  for (const [label, user, expectedRestrictToPlan] of [
    ['active beta tester', ACTIVE_BETA, ''],
    ['active monthly Pro subscriber', ACTIVE_MONTHLY_PRO, 'annual'],
  ] as const) {
    it(`opens Stage6Payment/ApplePaywall from the Profile subscription card for an ${label}`, async () => {
      currentUser = user;
      renderAppTree();

      await userEvent.click(screen.getByTestId('profile-manage-apple-subscription'));

      await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());
      const last = capturedPaywallProps.at(-1);
      expect(last?.upgradeIntent).toBe(true);
      expect(last?.restrictToPlan ?? '').toBe(expectedRestrictToPlan);
      expect(openAppleManageSubscriptions).not.toHaveBeenCalled();
    });

    it(`opens Stage6Payment/ApplePaywall from the Profile popover for an ${label}`, async () => {
      currentUser = user;
      renderAppTree();

      await userEvent.click(screen.getByText('iOS User'));
      await userEvent.click(await screen.findByText('Subscription'));

      await waitFor(() => expect(screen.getByTestId('apple-paywall')).toBeInTheDocument());
      const last = capturedPaywallProps.at(-1);
      expect(last?.upgradeIntent).toBe(true);
      expect(last?.restrictToPlan ?? '').toBe(expectedRestrictToPlan);
      expect(openAppleManageSubscriptions).not.toHaveBeenCalled();
    });
  }
});
