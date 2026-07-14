import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParchScreen, PrimaryCTA, SkipLink } from './ShellV8';
import ConnectionsPanel from '@/components/connections/ConnectionsPanel';
import { loadV8Row, saveV8 } from '@/utils/onboardingV8';
import type { CalendarProviderId, CalendarProvidersFetchResult } from '@/components/calendar/CalendarProviderPicker';
import { fetchCalendarProvidersState } from '@/components/calendar/CalendarProviderPicker';
import type { WearableProviderId, WearableProvidersFetchResult } from '@/components/connections/WearableProviderPicker';
import { fetchWearableProvidersState } from '@/components/connections/WearableProviderPicker';

const CAL_LEGACY: Record<string, CalendarProviderId> = { outlook: 'microsoft' };

function isProviderConnected(
  provider: CalendarProviderId | WearableProviderId,
  calendarResult: CalendarProvidersFetchResult | null,
  wearableResult: WearableProvidersFetchResult | null,
) {
  if (provider === 'google') return calendarResult?.providers.google?.connected === true;
  if (provider === 'microsoft') return calendarResult?.providers.microsoft?.connected === true;
  if (provider === 'apple') return calendarResult?.providers.apple?.connected === true;
  if (provider === 'apple-watch') return wearableResult?.providers.appleWatch?.connected === true;
  if (provider === 'oura') return wearableResult?.providers.oura?.connected === true;
  return wearableResult?.providers.whoop?.connected === true;
}

export default function StageConnections() {
  const navigate = useNavigate();
  const [calOnly, setCalOnly] = useState<CalendarProviderId[]>([]);
  const [wearOnly, setWearOnly] = useState<WearableProviderId[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarState, setCalendarState] = useState<CalendarProvidersFetchResult | null>(null);
  const [wearableState, setWearableState] = useState<WearableProvidersFetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadV8Row<{
      calendar_selections?: string[];
      wearable_selections?: string[];
    }>().then((res) => {
      if (cancelled) return;
      const calendarSelections = (res.data?.calendar_selections ?? [])
        .map((value) => CAL_LEGACY[value] ?? value)
        .filter((value): value is CalendarProviderId => ['google', 'microsoft', 'apple'].includes(value));
      const wearableSelections = (res.data?.wearable_selections ?? [])
        .filter((value): value is WearableProviderId => ['apple-watch', 'oura', 'whoop'].includes(value));
      setCalOnly(calendarSelections);
      setWearOnly(wearableSelections);
      setHydrated(true);
    }).catch(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatuses = useCallback(async () => {
    const [calendar, wearable] = await Promise.all([
      fetchCalendarProvidersState(),
      fetchWearableProvidersState(),
    ]);
    setCalendarState(calendar);
    setWearableState(wearable);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshStatuses();
  }, [hydrated, refreshStatuses]);

  const selectedCalendars = calOnly;
  const selectedWearables = useMemo(
    () => (wearOnly.length > 0 ? wearOnly : []),
    [wearOnly],
  );

  const selectedProviders = useMemo(
    () => [...selectedCalendars, ...selectedWearables],
    [selectedCalendars, selectedWearables],
  );
  const requiredConnectedProviders = useMemo(
    () => selectedProviders.filter((provider) => provider !== 'whoop'),
    [selectedProviders],
  );

  const connectedSelectedProviders = selectedProviders.filter((provider) =>
    isProviderConnected(provider, calendarState, wearableState),
  );
  const canContinue = hydrated && requiredConnectedProviders.every((provider) =>
    isProviderConnected(provider, calendarState, wearableState),
  );
  const canSkip = hydrated && selectedProviders.length > 0;

  const persistConnectStep = async () => {
    const result = await saveV8({}, 'connect');
    if (!result.ok) {
      throw new Error(result.error ?? 'connect_save_failed');
    }
  };

  const goNext = async () => {
    if (saving || !canContinue) return;
    setSaving(true);
    try {
      await persistConnectStep();
      navigate('/onboarding/done');
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (saving || !canSkip) return;
    setSaving(true);
    try {
      await persistConnectStep();
      navigate('/onboarding/done');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ParchScreen
      step="Connect"
      title="Mind Module, personalised based on your real data"
      footer={
        <div>
          {!canContinue && (
            <p aria-live="polite" className="text-[11px] text-[#7a7060] text-center mb-2">
              {selectedProviders.length === 0
                ? 'Choose providers on the previous step first.'
                : `Connected ${connectedSelectedProviders.length} of ${requiredConnectedProviders.length || selectedProviders.length} required providers.`}
            </p>
          )}
          <PrimaryCTA tone="coral" onClick={goNext} disabled={saving || !canContinue}>
            {saving ? 'Saving…' : 'Continue →'}
          </PrimaryCTA>
          <SkipLink onClick={skip}>Continue later</SkipLink>
        </div>
      }
    >
      <p className="text-xs text-[#7a7060] leading-[1.65] mb-3">
        Connect only the providers you selected. A provider you did not choose will not block onboarding, and any selected provider can be connected later from Profile → Connected Data.
      </p>
      {selectedWearables.includes('whoop') && (
        <p className="text-[11px] text-[#7a7060] leading-[1.55] mb-3">
          Whoop is still coming soon, so it will not block onboarding completion today.
        </p>
      )}
      <ConnectionsPanel
        calendarOnly={selectedCalendars}
        wearableOnly={selectedWearables}
        redirectPath="/onboarding/connect"
        onChanged={refreshStatuses}
      />
    </ParchScreen>
  );
}
