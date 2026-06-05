/**
 * Shared provider names + short notes used by both the onboarding
 * `/onboarding/permissions` step and the `/connected-data` page so the same
 * provider never reads two different ways across surfaces.
 *
 * Logos stay where they are (each surface imports its own asset module) —
 * this file only owns the canonical display name and the short copy that
 * appears under the name.
 */

export type CalendarProvider = 'google' | 'microsoft' | 'apple';
export type WearableProvider = 'apple-health' | 'oura' | 'whoop';

interface ProviderMeta {
  name: string;
  /** Short, neutral note shown under the name in onboarding + Profile. */
  note: string;
}

export const CALENDAR_PROVIDER_META: Record<CalendarProvider, ProviderMeta> = {
  google: {
    name: 'Google Calendar',
    note: 'Reads event titles and times to tune your brief and nudges.',
  },
  microsoft: {
    name: 'Microsoft Outlook',
    note: 'Reads event titles and times to tune your brief and nudges.',
  },
  apple: {
    name: 'Apple Calendar',
    note: 'Reads event titles and times to tune your brief and nudges.',
  },
};

export const WEARABLE_PROVIDER_META: Record<WearableProvider, ProviderMeta> = {
  'apple-health': {
    name: 'Apple Health',
    note: 'Shares HRV, resting HR, sleep, and HR as background signal.',
  },
  oura: {
    name: 'Oura Ring',
    note: 'Shares HRV, resting HR, sleep, and recovery as background signal.',
  },
  whoop: {
    name: 'Whoop',
    note: 'Shares HRV, strain, and recovery as background signal.',
  },
};