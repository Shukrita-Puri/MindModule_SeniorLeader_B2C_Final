/**
 * Awaiting-signals copy parity.
 *
 * Whichever awaiting sentence is correct for the signals present right now
 * (calendar-only, wearable-only, nothing connected, permission revoked …),
 * all three executive cards — MRS, Brief, Plan — must print the SAME one.
 * They therefore all resolve it through this single helper, which owns the
 * input precedence and the label de-duplication.
 *
 * Presentation only. No scoring, generation or backend behaviour here.
 */

import { getReadinessAwaitingCopy } from '@/utils/readinessAwaitingCopy';
import { AWAITING_SIGNALS_LABEL } from '@/components/home/AwaitingSignalsNotice';
import {
  useExecutiveConnectionStatus,
  type ExecutiveConnectionStatus,
} from '@/hooks/useExecutiveConnectionStatus';

/**
 * The reason-aware copy for `first_time` is a full sentence that already
 * begins with the label. The shared notice renders the label itself, so we
 * strip a leading "Awaiting signals — " to avoid printing it twice.
 */
export function stripAwaitingLabel(copy: string): string {
  const re = new RegExp(`^\\s*${AWAITING_SIGNALS_LABEL}\\s*[—–-]\\s*`, 'i');
  const stripped = copy.replace(re, '');
  if (stripped === copy) return copy;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Resolve the awaiting sentence from the live readiness payload.
 * `payload` is the shared `useOuterReadiness` data every card already holds,
 * so the three surfaces derive an identical string.
 */
export function resolveAwaitingSignalsCopy(payload?: unknown): string {
  return stripAwaitingLabel(getReadinessAwaitingCopy((payload ?? undefined) as never));
}

export function mergeAwaitingSignalsContext(
  payload: unknown,
  connections: ExecutiveConnectionStatus | null | undefined,
): unknown {
  if (!connections) return payload;
  const source = payload && typeof payload === 'object'
    ? payload as Record<string, any>
    : {};
  const sourceIntegration = source.integrationStatus && typeof source.integrationStatus === 'object'
    ? source.integrationStatus as Record<string, any>
    : {};

  return {
    ...source,
    hasCalendar: typeof source.hasCalendar === 'boolean'
      ? source.hasCalendar
      : connections.hasCalendar,
    hasWearable: typeof source.hasWearable === 'boolean'
      ? source.hasWearable
      : connections.hasWearable,
    integrationStatus: {
      calendar: {
        ...connections.integrationStatus.calendar,
        ...(sourceIntegration.calendar ?? {}),
      },
      wearable: {
        ...connections.integrationStatus.wearable,
        ...(sourceIntegration.wearable ?? {}),
      },
    },
  };
}

export function useAwaitingSignalsCopy(payload?: unknown): string {
  const { data: connections } = useExecutiveConnectionStatus();
  return resolveAwaitingSignalsCopy(mergeAwaitingSignalsContext(payload, connections));
}
