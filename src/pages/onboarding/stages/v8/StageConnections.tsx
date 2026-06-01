import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParchScreen, PrimaryCTA } from './ShellV8';
import ConnectionsPanel from '@/components/connections/ConnectionsPanel';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import type { CalendarProviderId } from '@/components/calendar/CalendarProviderPicker';
import type { WearableProviderId } from '@/components/connections/WearableProviderPicker';

const CAL_MAP: Record<string, CalendarProviderId> = {
  google: 'google',
  outlook: 'microsoft',
  microsoft: 'microsoft',
  apple: 'apple',
};
const WEAR_MAP: Record<string, WearableProviderId> = {
  'apple-watch': 'apple-watch',
  oura: 'oura',
  whoop: 'whoop',
};

/**
 * Post-onboarding Connections step. Renders the shared ConnectionsPanel
 * filtered to whatever the user picked on StagePermissions, so they can
 * actually OAuth / grant HealthKit before reaching StageDone. Skipping is
 * permitted — the selections themselves are still persisted from the
 * previous step.
 */
export default function StageConnections() {
  const navigate = useNavigate();
  const [calOnly, setCalOnly] = useState<CalendarProviderId[] | undefined>(undefined);
  const [wearOnly, setWearOnly] = useState<WearableProviderId[] | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        // Reuse the typed client; RLS scopes the row to the caller.
        const { data } = await supabase
          .from('onboarding_v8_responses')
          .select('calendar_selections, wearable_selections')
          .maybeSingle();
        const cal = (data?.calendar_selections ?? [])
          .map((s: string) => CAL_MAP[s])
          .filter(Boolean) as CalendarProviderId[];
        const wear = (data?.wearable_selections ?? [])
          .map((s: string) => WEAR_MAP[s])
          .filter(Boolean) as WearableProviderId[];
        if (cal.length) setCalOnly(cal);
        if (wear.length) setWearOnly(wear);
      } catch (err) {
        console.warn('[StageConnections] load selections failed:', err);
      }
    })();
  }, []);

  const goNext = () => navigate('/onboarding/done');

  return (
    <ParchScreen
      step="Connect"
      title="Now plug Mind Module in"
      footer={
        <PrimaryCTA tone="coral" onClick={goNext}>
          Continue →
        </PrimaryCTA>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-3">
        Authorize the providers you just selected. You can also skip this step and connect later from
        Profile → Connected Data.
      </p>
      <ConnectionsPanel
        calendarOnly={calOnly}
        wearableOnly={wearOnly}
        redirectPath="/onboarding/connect"
      />
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={goNext}
          className="text-[11px] text-[#7a7060] underline underline-offset-2"
        >
          Skip for now
        </button>
      </div>
    </ParchScreen>
  );
}