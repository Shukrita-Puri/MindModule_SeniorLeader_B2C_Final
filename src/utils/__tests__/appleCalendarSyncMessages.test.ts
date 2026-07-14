import { describe, it, expect } from 'vitest';
import {
  appleCalendarSyncSuccessMessage,
  isValidEventCount,
  formatEventCountLabel,
} from '@/utils/appleCalendarSyncMessages';

describe('isValidEventCount', () => {
  it('accepts non-negative finite integers', () => {
    expect(isValidEventCount(0)).toBe(true);
    expect(isValidEventCount(1)).toBe(true);
    expect(isValidEventCount(42)).toBe(true);
  });
  it('rejects undefined / null / NaN / negatives / floats / strings', () => {
    expect(isValidEventCount(undefined)).toBe(false);
    expect(isValidEventCount(null)).toBe(false);
    expect(isValidEventCount(Number.NaN)).toBe(false);
    expect(isValidEventCount(-1)).toBe(false);
    expect(isValidEventCount(1.5)).toBe(false);
    expect(isValidEventCount('5')).toBe(false);
    expect(isValidEventCount(Infinity)).toBe(false);
  });
});

describe('formatEventCountLabel', () => {
  it('renders singular for 1', () => {
    expect(formatEventCountLabel(1)).toBe('Synced 1 event');
  });
  it('renders plural for 0 and >1', () => {
    expect(formatEventCountLabel(0)).toBe('Synced 0 events');
    expect(formatEventCountLabel(5)).toBe('Synced 5 events');
  });
});

describe('appleCalendarSyncSuccessMessage', () => {
  it('connect + no count → generic truthful copy', () => {
    expect(appleCalendarSyncSuccessMessage('connect', undefined))
      .toBe('Apple Calendar connected and synced');
    expect(appleCalendarSyncSuccessMessage('connect', null))
      .toBe('Apple Calendar connected and synced');
    expect(appleCalendarSyncSuccessMessage('connect', Number.NaN))
      .toBe('Apple Calendar connected and synced');
  });
  it('manual + no count → generic truthful copy', () => {
    expect(appleCalendarSyncSuccessMessage('manual', undefined))
      .toBe('Apple Calendar sync completed');
  });
  it('connect + explicit 0 → surfaces 0 truthfully', () => {
    expect(appleCalendarSyncSuccessMessage('connect', 0))
      .toBe('Apple Calendar connected — synced 0 events');
  });
  it('manual + 1 → singular', () => {
    expect(appleCalendarSyncSuccessMessage('manual', 1))
      .toBe('Synced 1 event');
  });
  it('manual + N>1 → plural', () => {
    expect(appleCalendarSyncSuccessMessage('manual', 12))
      .toBe('Synced 12 events');
  });
  it('never renders 0 for invalid values', () => {
    for (const v of [undefined, null, Number.NaN, -1, '3' as unknown, 1.5]) {
      const msg = appleCalendarSyncSuccessMessage('manual', v);
      expect(msg).not.toMatch(/Synced 0 event/);
    }
  });
});