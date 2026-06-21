/**
 * Auth Retry Interceptor
 *
 * Globally patches `supabase.functions.invoke` so that any edge function
 * call returning HTTP 401 triggers a one-time silent token refresh and
 * retry. After the retry, the original result (success or failure) is
 * returned unchanged. Skipped in DEV_MODE (dev interceptor handles auth).
 */

import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE } from '@/config/devMode';
import { clearTokenCache, getAuthToken } from '@/services/authTokenService';

let patched = false;

interface Auth0LikeClient {
  getAccessTokenSilently(opts?: Record<string, unknown>): Promise<string>;
}

async function forceRefreshAuthToken(): Promise<string | null> {
  clearTokenCache();
  try {
    const win = window as typeof window & { __auth0Client?: Auth0LikeClient };
    if (win.__auth0Client?.getAccessTokenSilently) {
      const token = await win.__auth0Client.getAccessTokenSilently({ cacheMode: 'off' });
      if (token) return token;
    }
  } catch (err) {
    console.warn('[authRetryInterceptor] Silent refresh failed:', err);
  }
  // Fallback: native path / cached path via authTokenService
  return getAuthToken();
}

function getResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (ctx && typeof ctx === 'object' && 'status' in ctx) {
    const status = (ctx as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

export function installAuthRetryInterceptor(): void {
  if (DEV_MODE || patched) return;
  patched = true;

  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  supabase.functions.invoke = async (functionName: string, options?: any) => {
    const result = await originalInvoke(functionName, options);

    const status = getResponseStatus(result?.error);
    if (status !== 401) return result;

    console.warn(`[authRetryInterceptor] 401 from ${functionName} – refreshing token and retrying once`);

    const freshToken = await forceRefreshAuthToken();
    if (!freshToken) {
      console.warn('[authRetryInterceptor] No fresh token after refresh – giving up');
      return result;
    }

    const retryOptions = {
      ...(options || {}),
      headers: {
        ...((options && options.headers) || {}),
        Authorization: `Bearer ${freshToken}`,
      },
    };

    const retryResult = await originalInvoke(functionName, retryOptions);
    const retryStatus = getResponseStatus(retryResult?.error);
    if (retryStatus === 401) {
      console.warn(`[authRetryInterceptor] ${functionName} still 401 after refresh – session likely expired`);
    } else if (!retryResult?.error) {
      console.log(`[authRetryInterceptor] ✅ ${functionName} succeeded after token refresh`);
    }
    return retryResult;
  };

  console.log('[authRetryInterceptor] ✅ Patched supabase.functions.invoke with 401 auto-retry');
}