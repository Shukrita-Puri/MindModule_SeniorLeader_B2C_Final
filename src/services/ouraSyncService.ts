/**
 * Oura sync client — thin wrapper around the sync-oura and oura-oauth-start
 * edge functions. Mirrors the structure used by wearableSyncService for
 * consistency.
 */
import { getAuthToken } from '@/services/authTokenService';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';

function projectUrl(): string | null {
  const pid = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return pid ? `https://${pid}.supabase.co` : null;
}

export async function startOuraOAuth(redirectPath?: string): Promise<{ url?: string; error?: string }> {
  const token = await getAuthToken();
  const base = projectUrl();
  if (!token || !base) return { error: 'missing_auth_or_project' };
  emitIntegrationEvent({ provider: 'oura', event: 'connect_started' });
  try {
    const res = await fetch(`${base}/functions/v1/oura-oauth-start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectPath }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      emitIntegrationEvent({
        provider: 'oura', event: 'connect_failed',
        errorCode: `http_${res.status}`, errorMessage: t.slice(0, 200),
      });
      return { error: t || `http_${res.status}` };
    }
    const json = await res.json();
    return { url: json.authorizeUrl as string };
  } catch (err) {
    emitIntegrationEvent({
      provider: 'oura', event: 'connect_failed',
      errorCode: 'network_error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { error: err instanceof Error ? err.message : 'network_error' };
  }
}

export async function triggerOuraSync(manual = false): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = await getAuthToken();
  const base = projectUrl();
  if (!token || !base) return { ok: false, error: 'missing_auth_or_project' };
  emitIntegrationEvent({
    provider: 'oura',
    event: manual ? 'manual_sync_triggered' : 'sync_started',
  });
  try {
    const url = new URL(`${base}/functions/v1/sync-oura`);
    if (manual) url.searchParams.set('manual', 'true');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      emitIntegrationEvent({
        provider: 'oura', event: 'sync_failed',
        errorCode: `http_${res.status}`, errorMessage: t.slice(0, 200),
      });
      return { ok: false, status: res.status, error: t };
    }
    const json = await res.json().catch(() => ({}));
    emitIntegrationEvent({
      provider: 'oura', event: 'sync_success',
      syncState: json?.sync_status ?? undefined,
      meta: { written: json?.written, errors: json?.errors },
    });
    return { ok: true, status: res.status };
  } catch (err) {
    emitIntegrationEvent({
      provider: 'oura', event: 'sync_failed',
      errorCode: 'network_error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
  }
}
