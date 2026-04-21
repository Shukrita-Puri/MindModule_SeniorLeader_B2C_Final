import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

export interface BriefSnapshotRecord {
  id: string;
  user_id: string;
  local_date: string;
  time_window: string;
  phrase: string | null;
  body_text: string | null;
  lean_on: string | null;
  lean_on_source: string | null;
  watch_for: string | null;
  watch_for_source: string | null;
  score: number | null;
  tier: string | null;
  brief_source: string | null;
  driver: string | null;
  created_at: string;
}

const getAccessTokenOrAnon = async (): Promise<string | null> => {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  }
  return await getAuthToken();
};

export const useBriefSnapshot = (briefId: string | null | undefined) => {
  return useQuery<BriefSnapshotRecord | null>({
    queryKey: ['brief-snapshot', briefId],
    enabled: !!briefId,
    staleTime: Infinity,
    queryFn: async () => {
      if (!briefId) return null;
      const token = await getAccessTokenOrAnon();
      if (!token) return null;

      const { data, error } = await supabase.functions.invoke('brief-by-id', {
        headers: { Authorization: `Bearer ${token}` },
        body: { briefId },
      });

      if (error) {
        console.error('[useBriefSnapshot] error:', error);
        return null;
      }
      return (data?.data as BriefSnapshotRecord) || null;
    },
  });
};