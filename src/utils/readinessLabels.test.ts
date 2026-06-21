import { describe, expect, it } from 'vitest';
import { getReadinessOneLiner, getReadinessStateLabel } from './readinessLabels';

describe('readinessLabels', () => {
  it('treats awaiting as awaiting-signals copy', () => {
    expect(getReadinessStateLabel('awaiting')).toEqual({
      label: 'Awaiting signals',
      subtitle: 'sync your wearable and check in',
    });
  });

  it('shows Early read only for baseline + fresh wearable', () => {
    expect(getReadinessStateLabel('baseline', true)).toEqual({
      label: 'Early read',
      subtitle: 'check in to sharpen it',
    });
  });

  it('downgrades baseline without fresh wearable to awaiting copy', () => {
    expect(getReadinessStateLabel('baseline', false)).toEqual({
      label: 'Awaiting signals',
      subtitle: 'sync your wearable and check in',
    });
  });

  it('keeps refined as Full read', () => {
    expect(getReadinessStateLabel('refined', true).label).toBe('Full read');
  });

  it('returns null for missing one-liner score', () => {
    expect(getReadinessOneLiner(null)).toBeNull();
  });
});
