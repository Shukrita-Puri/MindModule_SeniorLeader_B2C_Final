import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock all IO dependencies before importing the module under test.
vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
vi.mock('@/utils/openUrl', () => ({ openUrl: vi.fn() }));
vi.mock('@/utils/appleCalendar', () => ({
  isAppleCalendarSupported: () => false,
  requestAppleCalendarPermission: vi.fn(),
}));
vi.mock('@/services/appleCalendarSync', () => ({
  syncAppleCalendarToBackend: vi.fn(),
}));
// Asset imports resolve to string paths under Vite; stub them for jsdom.
vi.mock('@/assets/shared/google-calendar-logo.avif', () => ({ default: 'g.avif' }));
vi.mock('@/assets/shared/microsoft-calendar-logo.png', () => ({ default: 'ms.png' }));

import CalendarProviderPicker, {
  fetchCalendarProvidersState,
} from '../CalendarProviderPicker';

beforeEach(() => {
  invoke.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCalendarProvidersState', () => {
  it('returns ok with per-provider status when backend succeeds', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        calendar: {
          status: 'ok',
          providers: {
            google:    { connected: true,  status: 'connected',    lastSync: '2026-07-05T00:00:00Z' },
            microsoft: { connected: false, status: 'disconnected', lastSync: null },
            apple:     { connected: false, status: 'disconnected', lastSync: null },
          },
        },
      },
      error: null,
    });
    const r = await fetchCalendarProvidersState();
    expect(r.status).toBe('ok');
    expect(r.providers.google?.status).toBe('connected');
    expect(r.providers.microsoft?.status).toBe('disconnected');
  });

  it('returns error (NOT disconnected) when the edge function invocation fails', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const r = await fetchCalendarProvidersState();
    expect(r.status).toBe('error');
    // All providers must be `unknown`, never silently `disconnected`.
    expect(r.providers.google?.status).toBe('unknown');
    expect(r.providers.microsoft?.status).toBe('unknown');
    expect(r.providers.apple?.status).toBe('unknown');
  });

  it('returns error when backend flags calendar.error even on 200 body', async () => {
    invoke.mockResolvedValueOnce({
      data: { calendar: { status: 'error', error: 'query_failed', errorMessage: 'db timeout', providers: {} } },
      error: null,
    });
    const r = await fetchCalendarProvidersState();
    expect(r.status).toBe('error');
    if (r.status !== 'error') throw new Error('narrowing');
    expect(r.message).toContain('db timeout');
    expect(r.providers.google?.status).toBe('unknown');
  });

  it('returns error when the invocation throws (network failure)', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    const r = await fetchCalendarProvidersState();
    expect(r.status).toBe('error');
    expect(r.providers.google?.status).toBe('unknown');
  });
});

describe('<CalendarProviderPicker /> — UI states', () => {
  it('renders an error banner with Retry when the status fetch fails, and does NOT show "Not connected"', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<CalendarProviderPicker redirectPath="/settings" hideApple />);

    const banner = await screen.findByTestId('calendar-provider-error');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent ?? '').toMatch(/Couldn't load calendar status/i);

    // Provider rows must NOT falsely claim "Not connected" — they show
    // "Status unavailable" instead.
    expect(screen.queryAllByText(/Not connected/i)).toHaveLength(0);
    expect(screen.getAllByText(/Status unavailable/i).length).toBeGreaterThan(0);

    // Retry button exists and re-invokes.
    invoke.mockResolvedValueOnce({
      data: {
        calendar: {
          status: 'ok',
          providers: {
            google:    { connected: true,  status: 'connected',    lastSync: null },
            microsoft: { connected: false, status: 'disconnected', lastSync: null },
          },
        },
      },
      error: null,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry loading calendar status/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-provider-error')).not.toBeInTheDocument();
    });
    // After successful refresh, disconnected provider correctly shows again.
    expect(await screen.findByText(/Not connected/i)).toBeInTheDocument();
  });

  it('renders connected/disconnected rows normally on successful load', async () => {
    invoke.mockResolvedValue({
      data: {
        calendar: {
          status: 'ok',
          providers: {
            google:    { connected: true,  status: 'connected',    lastSync: null },
            microsoft: { connected: false, status: 'disconnected', lastSync: null },
          },
        },
      },
      error: null,
    });
    render(<CalendarProviderPicker redirectPath="/settings" hideApple />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-provider-error')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(/^Connected$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
  });
});