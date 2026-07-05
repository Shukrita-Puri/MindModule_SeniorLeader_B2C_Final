import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
vi.mock('@/utils/openUrl', () => ({ openUrl: vi.fn() }));
vi.mock('@/services/ouraSyncService', () => ({ startOuraOAuth: vi.fn() }));
vi.mock('@/utils/healthKitCapacitor', () => ({
  requestHealthKitPermissions: vi.fn(),
  isNativeApp: () => false,
}));
vi.mock('@/services/wearableSyncService', () => ({
  syncHealthKitToBackend: vi.fn(),
}));
vi.mock('@/assets/shared/apple-health-logo.png', () => ({ default: 'ah.png' }));
vi.mock('@/assets/shared/oura-ring-logo.png', () => ({ default: 'o.png' }));
vi.mock('@/assets/shared/whoop-logo.png', () => ({ default: 'w.png' }));

import WearableProviderPicker, {
  fetchWearableProvidersState,
} from '../WearableProviderPicker';

beforeEach(() => { invoke.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('fetchWearableProvidersState', () => {
  it('returns ok with per-provider status when backend succeeds', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        oura: { status: 'ok', connected: true, lastSync: '2026-07-05T00:00:00Z' },
        appleWatch: { status: 'ok', connected: false, lastSync: null },
      },
      error: null,
    });
    const r = await fetchWearableProvidersState();
    expect(r.status).toBe('ok');
    expect(r.providers.oura?.status).toBe('connected');
    expect(r.providers.appleWatch?.status).toBe('disconnected');
  });

  it('returns error (NOT disconnected) when Oura branch is flagged error', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        oura: { status: 'error', error: 'query_failed', errorMessage: 'db timeout', connected: null },
        appleWatch: { status: 'ok', connected: false, lastSync: null },
      },
      error: null,
    });
    const r = await fetchWearableProvidersState();
    expect(r.status).toBe('error');
    if (r.status !== 'error') throw new Error('narrowing');
    expect(r.message).toContain('db timeout');
    expect(r.providers.oura?.status).toBe('unknown');
    // The healthy Apple Watch side must retain its real state.
    expect(r.providers.appleWatch?.status).toBe('disconnected');
    expect(r.partial).toBe(true);
  });

  it('returns error when Apple Watch branch is flagged error (wearable_data / user_integrations failure)', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        oura: { status: 'ok', connected: true, lastSync: null },
        appleWatch: {
          status: 'error',
          error: 'query_failed',
          errorMessage: 'wearable_data unavailable',
          erroredSources: ['wearable_data', 'user_integrations'],
          connected: null,
        },
      },
      error: null,
    });
    const r = await fetchWearableProvidersState();
    expect(r.status).toBe('error');
    if (r.status !== 'error') throw new Error('narrowing');
    expect(r.providers.appleWatch?.status).toBe('unknown');
    // Healthy Oura side preserved.
    expect(r.providers.oura?.status).toBe('connected');
    expect(r.erroredSources).toEqual(expect.arrayContaining(['wearable_data', 'user_integrations']));
  });

  it('marks both providers unknown when the invocation itself fails', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const r = await fetchWearableProvidersState();
    expect(r.status).toBe('error');
    expect(r.providers.oura?.status).toBe('unknown');
    expect(r.providers.appleWatch?.status).toBe('unknown');
  });

  it('returns error when the invocation throws (network failure)', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    const r = await fetchWearableProvidersState();
    expect(r.status).toBe('error');
    expect(r.providers.appleWatch?.status).toBe('unknown');
  });
});

describe('<WearableProviderPicker /> — UI states', () => {
  it('renders an error banner with Retry on fetch failure and does NOT show "Not connected"', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(<WearableProviderPicker />);

    const banner = await screen.findByTestId('wearable-provider-error');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent ?? '').toMatch(/Couldn't load wearable status/i);

    // Rows must NOT falsely claim "Not connected" during unknown state.
    expect(screen.queryAllByText(/^Not connected$/i)).toHaveLength(0);

    // Retry restores healthy state.
    invoke.mockResolvedValueOnce({
      data: {
        oura: { status: 'ok', connected: true, lastSync: null },
        appleWatch: { status: 'ok', connected: false, lastSync: null },
      },
      error: null,
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry loading wearable status/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('wearable-provider-error')).not.toBeInTheDocument();
    });
  });

  it('renders healthy Oura + Apple Watch rows normally on successful load', async () => {
    invoke.mockResolvedValue({
      data: {
        oura: { status: 'ok', connected: true, lastSync: null },
        appleWatch: { status: 'ok', connected: false, lastSync: null },
      },
      error: null,
    });
    render(<WearableProviderPicker only={['oura', 'apple-watch']} />);
    await waitFor(() => {
      expect(screen.queryByTestId('wearable-provider-error')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Oura Ring/i)).toBeInTheDocument();
    expect(screen.getByText(/Apple Watch/i)).toBeInTheDocument();
  });
});