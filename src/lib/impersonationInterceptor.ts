/**
 * Impersonation Interceptor
 *
 * When an admin has an active impersonation session (persisted in
 * sessionStorage by useImpersonation), inject `x-impersonation-token`
 * on all user-facing `supabase.functions.invoke` calls so the backend
 * transparently returns data for the target user.
 *
 * Admin edge functions (name starts with `admin-`) are excluded — those
 * must always authorize the real admin.
 */

import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'mm.admin.impersonation.v1';
const HEADER = 'x-impersonation-token';

let patched = false;

interface StoredImpersonation {
  token?: string;
  expiresAt?: number;
}

export function getActiveImpersonationToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImpersonation;
    if (!parsed?.token || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt * 1000 < Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

/** Admin endpoints must never receive the impersonation header. */
export function shouldAttachImpersonation(functionName: string): boolean {
  if (!functionName) return false;
  return !functionName.startsWith('admin-');
}

export function installImpersonationInterceptor(): void {
  if (patched) return;
  patched = true;

  const originalInvoke = supabase.functions.invoke.bind(supabase.functions);

  supabase.functions.invoke = async (functionName: string, options?: any) => {
    const token = getActiveImpersonationToken();
    if (!token || !shouldAttachImpersonation(functionName)) {
      return originalInvoke(functionName, options);
    }
    const merged = {
      ...(options || {}),
      headers: {
        ...((options && options.headers) || {}),
        [HEADER]: token,
      },
    };
    return originalInvoke(functionName, merged);
  };

  console.log('[impersonationInterceptor] ✅ Patched supabase.functions.invoke');
}