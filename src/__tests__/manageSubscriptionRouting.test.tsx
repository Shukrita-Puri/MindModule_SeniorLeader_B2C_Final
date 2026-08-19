/**
 * End-to-end (component-level) guard: active beta testers and active monthly
 * Pro users must reach the payment page (Stage6Payment at /upgrade) from BOTH
 * "Manage Subscription" entry points:
 *   1. Profile → Subscription card (AppleSubscriptionCard)
 *   2. Profile popover → "Subscription" item (UserSettingsPopover)
 *
 * Navigation only — no gating logic is asserted or changed here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { MANAGE_SUBSCRIPTION_UPGRADE_PATH, type AccessUser } from '@/utils/subscriptionHelpers';

const openAppleManageSubscriptions = vi.fn(async () => true);
vi.mock('@/services/iap', () => ({
  openAppleManageSubscriptions: (...a: unknown[]) => openAppleManageSubscriptions(...(a as [])),
  restoreIapPurchases: vi.fn(async () => ({ restored: 0, entitled: false })),
}));

let currentUser: AccessUser | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: currentUser ? { id: 'u1', email: 'beta@mindmodule.me', name: 'Beta User', ...currentUser } : null,
    loading: false,
    signOut: vi.fn(),
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

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <LocationProbe />
      <Routes>
        <Route path="/profile" element={<>{ui}</>} />
        <Route path="/upgrade" element={<div data-testid="stage6-payment">Payment Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Manage Subscription → payment page (beta + monthly Pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
  });

  for (const [label, user] of [
    ['active beta tester', ACTIVE_BETA],
    ['active monthly Pro subscriber', ACTIVE_MONTHLY_PRO],
  ] as const) {
    it(`opens the payment page from the Profile subscription card for an ${label}`, async () => {
      currentUser = user;
      renderWithRouter(
        <AppleSubscriptionCard user={user} onRefreshProfile={async () => undefined} />,
      );

      await userEvent.click(screen.getByTestId('profile-manage-apple-subscription'));

      await waitFor(() => expect(screen.getByTestId('stage6-payment')).toBeInTheDocument());
      expect(screen.getByTestId('location')).toHaveTextContent(MANAGE_SUBSCRIPTION_UPGRADE_PATH);
      expect(openAppleManageSubscriptions).not.toHaveBeenCalled();
    });

    it(`opens the payment page from the Profile popover for an ${label}`, async () => {
      currentUser = user;
      renderWithRouter(<UserSettingsPopover />);

      await userEvent.click(screen.getByText('Beta User'));
      await userEvent.click(await screen.findByText('Subscription'));

      await waitFor(() => expect(screen.getByTestId('stage6-payment')).toBeInTheDocument());
      expect(screen.getByTestId('location')).toHaveTextContent(MANAGE_SUBSCRIPTION_UPGRADE_PATH);
    });
  }

  it('keeps the native Apple manage sheet for an annual Pro subscriber', async () => {
    const annual: AccessUser = {
      subscription_status: 'active',
      subscription_tier: 'annual_pro',
      subscription_current_period_end: FUTURE,
    };
    currentUser = annual;
    renderWithRouter(
      <AppleSubscriptionCard user={{ ...annual, subscription_provider: 'apple' }} onRefreshProfile={async () => undefined} />,
    );

    await userEvent.click(screen.getByTestId('profile-manage-apple-subscription'));

    await waitFor(() => expect(openAppleManageSubscriptions).toHaveBeenCalled());
    expect(screen.queryByTestId('stage6-payment')).not.toBeInTheDocument();
  });
});
