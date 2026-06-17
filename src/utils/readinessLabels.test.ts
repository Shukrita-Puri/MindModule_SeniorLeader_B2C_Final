import { describe, expect, it } from 'vitest';
import { getReadinessOneLiner, getReadinessStateLabel } from './readinessLabels';

describe('readinessLabels', () => {
  it('treats awaiting as early read copy', () => {
    expect(getReadinessStateLabel('awaiting')).toEqual({
      label: 'Early read',
      subtitle: 'check in to sharpen it',
    });
  });

  it('returns null for missing one-liner score', () => {
    expect(getReadinessOneLiner(null)).toBeNull();
  });
});
