import { useCallback, useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';

export interface HomeRelocationPromptData { title: string; body: string }
export function useHomeRelocationPrompt() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState<HomeRelocationPromptData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPrompt(null);
    if (!user?.id) return;
    const check = async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const { data, error: requestError } = await supabase.functions.invoke('home-relocation-prompt', {
          method: 'GET', headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && !requestError) setPrompt(data?.prompt ?? null);
      } catch { /* optional prompt; keep the home screen usable */ }
    };
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void listener.then(handle => handle.remove());
    };
  }, [user?.id]);
  const respond = useCallback(async (action: 'not_now' | 'keep_home' | 'update') => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('no_session');
      const { data, error: requestError } = await supabase.functions.invoke('home-relocation-prompt', {
        body: { action }, headers: { Authorization: `Bearer ${token}` },
      });
      if (requestError || data?.ok !== true) throw new Error('save_failed');
      setPrompt(null);
      return true;
    } catch {
      setError("Couldn't save your choice. Please try again.");
      return false;
    } finally { setSaving(false); }
  }, [saving]);
  return { prompt, saving, error, respond };
}