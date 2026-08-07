/**
 * useCalendarPillContext
 *
 * Isolated fallback source for the Calendar signal pills.
 *
 * Under HOME_SNAPSHOT_ONLY the Brief renders from `brief_snapshots`, whose
 * `payload_json` carries no calendar fields, and the live
 * `compute-outer-readiness` query is disabled. That leaves `hasCalendar` /
 * `calendarState` undefined on the Brief payload, so the Calendar pill
 * incorrectly rendered the "CONNECT" prompt for users with a connected
 * calendar.
 *
 * This hook reads the SAME canonical server calendar metrics the Brief used
 * to carry, via the existing `contextOnly: true` mode of
 * `compute-outer-readiness`. No new calendar logic is introduced client-side.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

export interface CalendarPillContext {
  calendarState: 'active' | 'connected_no_events' | 'not_connected' | null;
  hasCalendar: boolean;
  calendarLoad: 'low' | 'medium' | 'high' | null;
  meetingCount: number | null;
  remainingMeetings: number | null;
  remainingHighStakes: string[];
}

export function useCalendarPillContext(enabled: boolean) {
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;

  return useQuery<CalendarPillContext | null>({
    queryKey: ['calendar-pill-context', userId],
    enabled: !!userId && enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (!DEV_MODE) {
        let token: string | null = null;
        try {
          token = await getAuthToken();
        } catch {
          token = null;
        }
        if (!token) return null;
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await supabase.functions.invoke('compute-outer-readiness', {
        headers,
        body: {
          contextOnly: true,
          innerReadinessTier: 'managing',
          innerReadinessScore: null,
          clarityLevel: null,
          confidenceLevel: null,
          checkInOutcome: null,
          timezoneOffset: new Date().getTimezoneOffset(),
          currentTimezone: (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
            } catch {
              return null;
            }
          })(),
          ...(DEV_MODE && userId ? { userId } : {}),
        },
      });

      if (res.error || !res.data) return null;
      const raw = res.data as Record<string, unknown>;
      const state = (raw.calendarState as CalendarPillContext['calendarState']) ?? null;
      return {
        calendarState: state,
        hasCalendar: state === 'active',
        calendarLoad: (raw.calendarLoad as CalendarPillContext['calendarLoad']) ?? null,
        meetingCount: (raw.meetingCount as number | null) ?? null,
        remainingMeetings: (raw.remainingMeetings as number | null) ?? null,
        remainingHighStakes: Array.isArray(raw.remainingHighStakes)
          ? (raw.remainingHighStakes as string[])
          : [],
      };
    },
  });
}
