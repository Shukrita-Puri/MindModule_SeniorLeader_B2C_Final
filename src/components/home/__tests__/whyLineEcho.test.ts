import { describe, expect, it } from 'vitest';

import { isWhyLineEcho } from '../whyLineEcho';

describe('whyLineEcho', () => {
  it('flags exact title echoes case-insensitively', () => {
    expect(isWhyLineEcho('Steady the system', 'steady the system')).toBe(true);
  });

  it('does not flag distinct copy', () => {
    expect(isWhyLineEcho('Protect composure before the board call.', 'Steady the system')).toBe(false);
  });

  it('ignores empty values safely', () => {
    expect(isWhyLineEcho('', 'Steady the system')).toBe(false);
    expect(isWhyLineEcho('Steady the system', '')).toBe(false);
  });
});
