/**
 * Dev Mode Interceptor
 * 
 * Monkey-patches supabase.functions.invoke to automatically inject
 * the x-dev-user-id header in dev mode. This allows all edge functions
 * to bypass Auth0 without changing any call sites.
 * 
 * TEMPORARY: Remove once Auth0 secrets are properly configured.
 */

import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

let patched = false;

export function installDevInterceptor(): void {
  if (!DEV_MODE || patched) return;
  patched = true;

  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  supabase.functions.invoke = async (functionName: string, options?: any) => {
    const devHeaders: Record<string, string> = {
      'x-dev-user-id': DEV_USER.id,
    };

    const mergedOptions = {
      ...options,
      headers: {
        ...devHeaders,
        ...(options?.headers || {}),
      },
    };

    return originalInvoke(functionName, mergedOptions);
  };

  console.log('[devInterceptor] ✅ Patched supabase.functions.invoke with dev headers');
}
