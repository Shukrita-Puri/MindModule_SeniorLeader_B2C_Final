import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CalendarProviderPicker, { fetchCalendarProvidersState } from '@/components/calendar/CalendarProviderPicker';
import { supabase } from '@/integrations/supabase/client';
import * as authTokenService from '@/services/authTokenService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn(),
}));

vi.mock('@/utils/openUrl', () => ({
  openUrl: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('CalendarProviderPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authTokenService.getAuthToken).mockResolvedValue('mock-jwt-token');
  });

  describe('fetchCalendarProvidersState', () => {
    it('maps needsReconnect flag from check-connections-status payload', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          calendar: {
            connected: false,
            status: 'ok',
            providers: {
              google: {
                connected: false,
                status: 'disconnected',
                needsReconnect: true,
                lastSync: '2026-09-10T10:00:00Z',
              },
              microsoft: {
                connected: true,
                status: 'connected',
                needsReconnect: false,
                lastSync: new Date().toISOString(),
              },
            },
          },
        },
        error: null,
      } as any);

      const res = await fetchCalendarProvidersState();
      expect(res.status).toBe('ok');
      if (res.status === 'ok') {
        expect(res.providers.google?.needsReconnect).toBe(true);
        expect(res.providers.google?.connected).toBe(false);
        expect(res.providers.microsoft?.needsReconnect).toBe(false);
        expect(res.providers.microsoft?.connected).toBe(true);
      }
    });
  });

  describe('ProviderRow UI features', () => {
    it('shows "Updates automatically" for fresh connected Google/Outlook calendars', async () => {
      // 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          calendar: {
            connected: true,
            status: 'ok',
            providers: {
              google: {
                connected: true,
                status: 'connected',
                needsReconnect: false,
                lastSync: twoHoursAgo,
              },
            },
          },
        },
        error: null,
      } as any);

      render(<CalendarProviderPicker redirectPath="/settings" only={['google']} />);

      await waitFor(() => {
        expect(screen.getByText(/Last sync 2h ago · Updates automatically/i)).toBeInTheDocument();
      });

      // Verify "Sync now" button is present on connected Google row
      const syncNowBtn = screen.getByRole('button', { name: /Sync Google Calendar now/i });
      expect(syncNowBtn).toBeInTheDocument();
    });

    it('shows "Not updated since [Weekday] — reconnect" warning when last sync is > 24 hours old', async () => {
      // Tuesday 15 September 2026 10:00 UTC
      const tuesdayDate = '2026-09-15T10:00:00Z';
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          calendar: {
            connected: true,
            status: 'ok',
            providers: {
              google: {
                connected: true,
                status: 'connected',
                needsReconnect: false,
                lastSync: tuesdayDate,
              },
            },
          },
        },
        error: null,
      } as any);

      render(<CalendarProviderPicker redirectPath="/settings" only={['google']} />);

      await waitFor(() => {
        expect(screen.getByText(/Not updated since Tuesday — reconnect/i)).toBeInTheDocument();
      });
    });

    it('renders Reconnect badge and button when needsReconnect is true', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          calendar: {
            connected: false,
            status: 'ok',
            providers: {
              microsoft: {
                connected: false,
                status: 'disconnected',
                needsReconnect: true,
                lastSync: '2026-09-08T10:00:00Z',
              },
            },
          },
        },
        error: null,
      } as any);

      render(<CalendarProviderPicker redirectPath="/settings" only={['microsoft']} />);

      await waitFor(() => {
        expect(screen.getByText('Reconnect', { selector: 'button' })).toBeInTheDocument();
        expect(screen.getByText('Reconnect', { selector: 'div' })).toBeInTheDocument();
      });
    });

    it('triggers manual sync on "Sync now" button click', async () => {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          calendar: {
            connected: true,
            status: 'ok',
            providers: {
              google: {
                connected: true,
                status: 'connected',
                needsReconnect: false,
                lastSync: oneHourAgo,
              },
            },
          },
        },
        error: null,
      } as any);

      render(<CalendarProviderPicker redirectPath="/settings" only={['google']} />);

      const syncNowBtn = await screen.findByRole('button', { name: /Sync Google Calendar now/i });

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, eventCount: 12 },
        error: null,
      } as any);

      fireEvent.click(syncNowBtn);

      await waitFor(() => {
        expect(supabase.functions.invoke).toHaveBeenCalledWith('sync-calendar', {
          body: { provider: 'google' },
          headers: { Authorization: 'Bearer mock-jwt-token' },
        });
      });
    });
  });
});
