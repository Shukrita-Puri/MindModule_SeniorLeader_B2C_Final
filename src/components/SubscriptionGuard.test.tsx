import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SubscriptionGuard } from './SubscriptionGuard';
import type { AccessUser } from '@/utils/subscriptionHelpers';

let currentUser: (AccessUser & { id: string; email: string }) | null = null;
let loading = false;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: currentUser, loading }),
}));

vi.mock('@/config/payments', () => ({
  PAYMENT_PAGE_SUPPRESSED: false,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <LocationProbe />
      <Routes>
        <Route
          path="/protected"
          element={
            <SubscriptionGuard>
              <div data-testid="protected-content">Protected</div>
            </SubscriptionGuard>
          }
        />
        <Route path="/upgrade" element={<div data-testid="upgrade-page">Upgrade</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SubscriptionGuard first-time user routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = null;
    loading = false;
  });

  it('redirects a first-time user to the payment page', async () => {
    currentUser = {
      id: 'u1',
      email: 'new@mindmodule.me',
      subscription_status: 'none',
      subscription_tier: 'none',
    };
    renderGuard();

    await waitFor(() => expect(screen.getByTestId('upgrade-page')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/upgrade?source=first-run');
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('shows the trial popup for a user with an expired trial', async () => {
    currentUser = {
      id: 'u2',
      email: 'expired@mindmodule.me',
      subscription_status: 'none',
      subscription_tier: 'none',
      trial_ends_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    };
    renderGuard();

    await waitFor(() => expect(screen.queryByTestId('upgrade-page')).not.toBeInTheDocument());
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders protected content for an active subscriber', async () => {
    currentUser = {
      id: 'u3',
      email: 'active@mindmodule.me',
      subscription_status: 'active',
      subscription_tier: 'monthly_pro',
      subscription_current_period_end: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
    renderGuard();

    await waitFor(() => expect(screen.getByTestId('protected-content')).toBeInTheDocument());
    expect(screen.queryByTestId('upgrade-page')).not.toBeInTheDocument();
  });
});
