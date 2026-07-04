import { describe, expect, it } from 'vitest';
import {
  deriveAwaitingReason,
  getAwaitingCopy,
  getReadinessOneLiner,
  getReadinessStateLabel,
} from './readinessLabels';

describe('readinessLabels', () => {
  it('treats awaiting as awaiting-signals copy', () => {
    expect(getReadinessStateLabel('awaiting')).toEqual({
      label: 'Awaiting signals',
      subtitle: 'sync your wearable, calendar to get an early read and check in to sharpen it',
    });
  });

  it('shows Early read for baseline + Stage 1 signal', () => {
    expect(getReadinessStateLabel('baseline', true)).toEqual({
      label: 'Early read',
      subtitle: 'check in to sharpen it',
    });
  });

  it('downgrades baseline without a Stage 1 signal to awaiting copy', () => {
    expect(getReadinessStateLabel('baseline', false)).toEqual({
      label: 'Awaiting signals',
      subtitle: 'sync your wearable, calendar to get an early read and check in to sharpen it',
    });
  });

  it('keeps refined as Full read', () => {
    expect(getReadinessStateLabel('refined', true).label).toBe('Full read');
  });

  it('downgrades refined without a Stage 1 signal to awaiting', () => {
    expect(getReadinessStateLabel('refined', false)).toEqual({
      label: 'Awaiting signals',
      subtitle: 'sync your wearable, calendar to get an early read and check in to sharpen it',
    });
  });

  it('returns null for missing one-liner score', () => {
    expect(getReadinessOneLiner(null)).toBeNull();
  });

  it('derives no-new-data wearable reason', () => {
    expect(deriveAwaitingReason({
      integrationStatus: {
        wearable: {
          connectionStatus: 'connected',
          hasTodayData: false,
          hasRecentData: false,
          hasHistoricalData: true,
        },
      },
    })).toBe('wearable_connected_no_data');
  });

  it('derives calendar-missing reason when wearable signal exists', () => {
    expect(deriveAwaitingReason({
      hasWearable: true,
      wearableStatus: { isConnected: true, hasTodayData: true, hasRecentData: true },
      hasCalendar: false,
      calendarState: 'not_connected',
    })).toBe('wearable_present_calendar_missing');
  });

  it('returns the canonical first-time awaiting copy', () => {
    expect(getAwaitingCopy('first_time')).toBe(
      'Awaiting signals — connect your wearable and calendar to get an early read, then check in to sharpen it.',
    );
  });
});
