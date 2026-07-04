import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAuthToken } from '@/services/authTokenService';

const STORAGE_KEY = 'mm.admin.impersonation.v1';

export interface ImpersonationSession {
  token: string;
  expiresAt: number;
  target: { id: string; email: string; name: string | null };
  startedAt: number;
}

interface ImpersonationContextValue {
  session: ImpersonationSession | null;
  isImpersonating: boolean;
  start: (target: { id: string; email: string; name: string | null }) => Promise<{ ok: boolean; error?: string }>;
  stop: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(undefined);

function readStored(): ImpersonationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonationSession;
    if (!parsed?.token || !parsed?.target?.id) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt * 1000 < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(session: ImpersonationSession | null) {
  try {
    if (!session) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch { /* storage disabled — non-fatal */ }
}

export const ImpersonationProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<ImpersonationSession | null>(() => readStored());

  // Auto-expire if the stored TTL passes while the tab is open.
  useEffect(() => {
    if (!session) return;
    const msRemaining = session.expiresAt * 1000 - Date.now();
    if (msRemaining <= 0) {
      writeStored(null);
      setSession(null);
      return;
    }
    const t = window.setTimeout(() => {
      writeStored(null);
      setSession(null);
    }, Math.min(msRemaining, 2147483000));
    return () => window.clearTimeout(t);
  }, [session]);

  const start = useCallback(async (target: { id: string; email: string; name: string | null }) => {
    try {
      const token = await getAuthToken();
      if (!token) return { ok: false, error: 'Not authenticated' };
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-start-impersonation`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ targetUserId: target.id }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err?.error ?? `HTTP ${res.status}` };
      }
      const data = await res.json();
      const next: ImpersonationSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        target: data.target,
        startedAt: Math.floor(Date.now() / 1000),
      };
      writeStored(next);
      setSession(next);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  const stop = useCallback(async () => {
    const current = session;
    writeStored(null);
    setSession(null);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-end-impersonation`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUserId: current?.target.id ?? null,
            targetEmail: current?.target.email ?? null,
          }),
        },
      );
    } catch { /* best-effort audit */ }
  }, [session]);

  const value = useMemo<ImpersonationContextValue>(
    () => ({ session, isImpersonating: !!session, start, stop }),
    [session, start, stop],
  );

  return <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>;
};

export function useImpersonation(): ImpersonationContextValue {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    // Non-fatal: components rendered outside the provider get a no-op shape.
    return {
      session: null,
      isImpersonating: false,
      start: async () => ({ ok: false, error: 'ImpersonationProvider missing' }),
      stop: async () => {},
    };
  }
  return ctx;
}

/**
 * Read the currently impersonated target user id (or null).
 * Suitable for hooks that need to substitute a user id in edge-function
 * calls or client-side queries.
 */
export function useImpersonatedUserId(): string | null {
  return useImpersonation().session?.target.id ?? null;
}