import { describe, it, expect } from 'vitest';
import { formatDisplayValue, isUnsafeObjectText, safeText } from './safeDisplayValue';

describe('isUnsafeObjectText', () => {
  it.each(['[object Object]', '[object Promise]', 'undefined', 'null', 'NaN'])(
    'flags %s as unsafe',
    (s) => expect(isUnsafeObjectText(s)).toBe(true),
  );
  it('passes plain strings', () => {
    expect(isUnsafeObjectText('Stable')).toBe(false);
    expect(isUnsafeObjectText('+2 vs baseline')).toBe(false);
  });
});

describe('formatDisplayValue', () => {
  it('extracts a display-safe field from a nested object', () => {
    const out = formatDisplayValue({ status: 'stable', delta: { value: 2 } });
    expect(out).toBe('stable');
    expect(out).not.toMatch(/\[object/);
  });
  it('returns "" when no safe field exists', () => {
    expect(formatDisplayValue({ delta: { value: 2 } })).toBe('');
  });
  it('joins array of objects safely', () => {
    const out = formatDisplayValue([{ label: 'A' }, { label: 'B' }]);
    expect(out).toBe('A · B');
    expect(out).not.toMatch(/\[object/);
  });
  it('never returns the literal "[object Object]"', () => {
    const out = formatDisplayValue({ cooccurrence_count: 1, days_observed: 1 });
    expect(out).not.toMatch(/\[object/);
  });
});

describe('safeText', () => {
  it('returns empty for unsafe object text', () => {
    expect(safeText('[object Object]')).toBe('');
  });
  it('passes through safe values', () => {
    expect(safeText('Stable')).toBe('Stable');
    expect(safeText(7)).toBe('7');
  });
});