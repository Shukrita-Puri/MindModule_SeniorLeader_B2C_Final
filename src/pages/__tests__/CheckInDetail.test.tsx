import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckInDetail from '../CheckInDetail';

const { mockNavigate, mockInvalidateQueries, mockToast, mockInvoke } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockToast: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock('@/config/devMode', () => ({
  DEV_MODE: false,
  DEV_USER: { id: 'dev-user' },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn().mockResolvedValue('auth-token'),
  getAccessToken: vi.fn().mockResolvedValue('auth-token'),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

vi.mock('@/components/navigation/LeftSidebar', () => ({
  default: () => <div data-testid="left-sidebar" />,
}));

vi.mock('@/components/navigation/SidebarDiscoveryPulse', () => ({
  default: () => <div data-testid="sidebar-discovery-pulse" />,
}));

vi.mock('@/components/navigation/FloatingPillNav', () => ({
  default: () => <div data-testid="floating-pill-nav" />,
}));

vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/slider', () => ({
  Slider: ({ onValueChange, 'aria-label': ariaLabel }: any) => (
    <button type="button" aria-label={ariaLabel || 'slider'} onClick={() => onValueChange([4])}>
      slider
    </button>
  ),
}));

vi.mock('@/utils/dailyCheckins', () => ({
  clearTodayCheckinCache: vi.fn(),
  getCurrentTimeWindow: vi.fn(() => 'morning'),
}));

vi.mock('@/utils/energyStateEngine', () => ({
  clearEnergyStateCache: vi.fn(),
}));

vi.mock('@/hooks/useOuterReadiness', () => ({
  clearOuterReadinessCache: vi.fn(),
}));



function renderDetail() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/check-in-detail',
          state: {
            checkinDate: '2026-04-28',
            timeWindow: 'afternoon',
            checkinId: 'checkin-abc',
          },
        },
      ]}
    >
      <CheckInDetail />
    </MemoryRouter>,
  );
}

async function touchAllSliders() {
  // Click only check-in input controls (sliders & option buttons), excluding navigation steps
  const buttons = screen.getAllByRole('button');
  buttons.forEach((btn) => {
    const text = (btn.textContent || '').trim();
    if (
      text === '+' ||
      text === '-' ||
      ['Poor', 'OK', 'Good', 'Great', 'Groggy', 'Alarm', 'Natural'].includes(text) ||
      btn.getAttribute('aria-label') === 'slider'
    ) {
      fireEvent.click(btn);
    }
  });
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
  mockNavigate.mockReset();
  mockInvalidateQueries.mockReset();
  mockToast.mockReset();
  mockInvoke.mockReset();
});

describe('CheckInDetail', () => {
  it('updates the exact saved check-in row and navigates on success', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { data: { id: 'checkin-abc' } },
      error: null,
    });

    renderDetail();
    await touchAllSliders();
    fireEvent.click(screen.getByRole('button', { name: /continue to today's brief/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('daily-checkins', expect.objectContaining({
        headers: { Authorization: 'Bearer auth-token' },
        body: expect.objectContaining({
          action: 'UPDATE_BODY_CHECKIN',
          checkinDate: '2026-04-28',
          timeWindow: 'afternoon',
          checkinId: 'checkin-abc',
        }),
      }));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/executive-home');
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['mrs-weekly-delta'] });
  });

  it('does not navigate when the update response has no row', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { data: null },
      error: null,
    });

    renderDetail();
    await touchAllSliders();
    fireEvent.click(screen.getByRole('button', { name: /continue to today's brief/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Save failed',
        variant: 'destructive',
      }));
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
