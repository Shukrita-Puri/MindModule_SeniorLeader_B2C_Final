import { useCallback, useState } from 'react';
import CalendarProviderPicker, { type CalendarProviderId } from '@/components/calendar/CalendarProviderPicker';
import WearableProviderPicker, { type WearableProviderId } from './WearableProviderPicker';

export interface ConnectionsPanelProps {
  /** Only render these calendar providers. If omitted, show all. */
  calendarOnly?: CalendarProviderId[];
  /** Only render these wearable providers. If omitted, show all. */
  wearableOnly?: WearableProviderId[];
  /** Where OAuth should return the user. Defaults to the current path. */
  redirectPath?: string;
  /** Fires when any provider state changes. */
  onChanged?: () => void;
}

/**
 * Shared connections surface used by both the post-onboarding Connections step
 * and the Profile screen. Wraps the existing CalendarProviderPicker and the
 * new WearableProviderPicker so both surfaces share identical connect/disconnect
 * logic and visual treatment.
 */
export default function ConnectionsPanel({
  calendarOnly,
  wearableOnly,
  redirectPath,
  onChanged,
}: ConnectionsPanelProps) {
  const [, setVersion] = useState(0);
  const handleChanged = useCallback(() => {
    setVersion((v) => v + 1);
    onChanged?.();
  }, [onChanged]);

  const resolvedRedirect = redirectPath
    ?? (typeof window !== 'undefined' ? window.location.pathname : '/connected-data');

  return (
    <div className="space-y-5">
      <section>
        <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground font-medium mb-2">
          Calendar
        </div>
        <CalendarProviderPicker
          redirectPath={resolvedRedirect}
          only={calendarOnly}
          onChanged={handleChanged}
        />
      </section>
      <section>
        <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground font-medium mb-2">
          Wearable
        </div>
        <WearableProviderPicker only={wearableOnly} onChanged={handleChanged} />
      </section>
    </div>
  );
}
