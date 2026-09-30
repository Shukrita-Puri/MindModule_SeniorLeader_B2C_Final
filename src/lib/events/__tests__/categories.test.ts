import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_CATEGORY_NAMES,
  EVENT_CATEGORY_ORDER,
  isCanonicalCategoryLabel,
} from '../categories';

const BACKEND_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/events/event-categories.ts'),
  'utf8',
);

function backendNames(): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /id:\s*"([A-J])",\s*\n\s*name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(BACKEND_SRC)) !== null) out[m[1]] = m[2];
  return out;
}

describe('A–J frontend mirror stays in sync with the backend SSOT', () => {
  it('mirrors all ten pillar names verbatim', () => {
    expect(backendNames()).toEqual(EVENT_CATEGORY_NAMES);
  });

  it('covers A through J in order', () => {
    expect(EVENT_CATEGORY_ORDER).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  });

  it('recognises canonical labels only', () => {
    expect(isCanonicalCategoryLabel('Strategic Thinking & Decision Making')).toBe(true);
    expect(isCanonicalCategoryLabel('Operations & Execution')).toBe(true);
    expect(isCanonicalCategoryLabel('Crisis, Risk & Incidents')).toBe(true);
    expect(isCanonicalCategoryLabel('Small-group meetings')).toBe(false);
    expect(isCanonicalCategoryLabel(null)).toBe(false);
  });
});

describe('Insights causality card uses canonical A–H labels only', () => {
  const CARD_SRC = readFileSync(
    join(process.cwd(), 'src/components/insights/PerformanceCausalityCard.tsx'),
    'utf8',
  );

  it('sources canonical pillar names from the frontend mirror, not literals', () => {
    expect(CARD_SRC).toMatch(
      /import\s*\{[^}]*EVENT_CATEGORY_NAMES[^}]*\}\s*from\s*'@\/lib\/events\/categories'/,
    );
    const start = CARD_SRC.indexOf('const CATEGORY_LABELS');
    expect(start).toBeGreaterThan(-1);
    const slice = CARD_SRC.slice(start, CARD_SRC.indexOf('};', start));
    // No hardcoded pillar-name string literals may remain in the alias map.
    const values = [...slice.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const v of values) expect(isCanonicalCategoryLabel(v)).toBe(false);
    // Every alias resolves through a mirror reference (C.A … C.H).
    expect(slice).toMatch(/:\s*C\.[A-H]/);
  });
});
