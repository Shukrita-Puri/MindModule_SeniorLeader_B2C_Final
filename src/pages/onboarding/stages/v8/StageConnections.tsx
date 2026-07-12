import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParchScreen, PrimaryCTA } from './ShellV8';
import ConnectionsPanel from '@/components/connections/ConnectionsPanel';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { CALENDAR_PROVIDERS, WEARABLE_PROVIDERS } from '@/utils/onboardingV8Validation';
import {
  fetchCalendarProvidersState,
  type CalendarProviderId,
} from '@/components/calendar/CalendarProviderPicker';
import {
  fetchWearableProvidersState,
  type WearableProviderId,
} from '@/components/connections/WearableProviderPicker';

// Backward-compat: legacy rows may have stored "outlook" instead of the
// canonical "microsoft". sanitizePayload rewrites on write; this map covers
// reads of pre-existing rows.
const CAL_LEGACY: Record<string, CalendarProviderId> = { outlook: 'microsoft' };
const CAL_ALLOWED = new Set<string>(CALENDAR_PROVIDERS);
const WEAR_ALLOWED = new Set<string>(WEARABLE_PROVIDERS);

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
          .map((s: string) => CAL_LEGACY[s] ?? s)
          .filter((s: string) => CAL_ALLOWED.has(s)) as CalendarProviderId[];
        const wear = (data?.wearable_selections ?? [])
          .filter((s: string) => WEAR_ALLOWED.has(s)) as WearableProviderId[];
        if (cal.length) setCalOnly(cal);
        if (wear.length) setWearOnly(wear);
      } catch (err) {
        console.warn('[StageConnections] load selections failed:', err);
      }
    })();
  }, []);

  const [hasCalendar, setHasCalendar] = useState(false);
  const [hasWearable, setHasWearable] = useState(false);
  const canContinue = hasCalendar && hasWearable;

  const refreshStatuses = useCallback(async () => {
    try {
      const [cal, wear] = await Promise.all([
        fetchCalendarProvidersState(),
        fetchWearableProvidersState(),
      ]);
      const calProv = cal.providers;
      setHasCalendar(
        !!(calProv.google?.connected || calProv.microsoft?.connected || calProv.apple?.connected),
      );
      const wearProv = wear.providers;
      setHasWearable(!!(wearProv['apple-watch']?.connected || wearProv.oura?.connected));
    } catch (err) {
      console.warn('[StageConnections] refresh statuses failed:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses]);

  const goNext = () => {
    if (!canContinue) return;
    navigate('/onboarding/done');
  };

  // Filter Whoop off this screen; ensure Apple Watch + Oura still render when
  // the user hadn't preselected any wearable (or only selected Whoop).
  const wearOnlyFiltered: WearableProviderId[] = (() => {
    const base = (wearOnly ?? (['apple-watch', 'oura'] as WearableProviderId[]))
      .filter((w) => w !== 'whoop');
    return base.length ? base : (['apple-watch', 'oura'] as WearableProviderId[]);
  })();

  return (
    <ParchScreen
      step="Connect"
      title="Mind Module, personalised based on your real data"
      footer={
        <div>
          {!canContinue && (
            <p
              aria-live="polite"
              className="text-[11px] text-[#7a7060] text-center mb-2"
            >
              Requires 1 calendar and 1 wearable
            </p>
          )}
          <PrimaryCTA tone="coral" onClick={goNext} disabled={!canContinue}>
            Continue →
          </PrimaryCTA>
        </div>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-3">
        Connect your day with one calendar and your body with one wearable to unlock bespoke insights
        from day one. No generic advice — just recommendations built for you. You can connect more
        later in Profile → Connected Data.
      </p>
      <ConnectionsPanel
        calendarOnly={calOnly}
        wearableOnly={wearOnlyFiltered}
        redirectPath="/onboarding/connect"
        onChanged={refreshStatuses}
      />
    </ParchScreen>
  );
}