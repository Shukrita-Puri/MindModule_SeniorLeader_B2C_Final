import { describe, expect, it } from 'vitest';
import { getReadinessOneLiner, getReadinessStateLabel } from './readinessLabels';

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
});
