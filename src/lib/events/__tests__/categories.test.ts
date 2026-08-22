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
  const re = /id:\s*"([A-H])",\s*\n\s*name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(BACKEND_SRC)) !== null) out[m[1]] = m[2];
  return out;
}

describe('A–H frontend mirror stays in sync with the backend SSOT', () => {
  it('mirrors all eight pillar names verbatim', () => {
    expect(backendNames()).toEqual(EVENT_CATEGORY_NAMES);
  });

  it('covers A through H in order', () => {
    expect(EVENT_CATEGORY_ORDER).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  it('recognises canonical labels only', () => {
    expect(isCanonicalCategoryLabel('Deep Work & Strategy')).toBe(true);
    expect(isCanonicalCategoryLabel('Small-group meetings')).toBe(false);
    expect(isCanonicalCategoryLabel(null)).toBe(false);
  });
});

describe('Insights causality card uses canonical A–H labels only', () => {
  const CARD_SRC = readFileSync(
    join(process.cwd(), 'src/components/insights/PerformanceCausalityCard.tsx'),
    'utf8',
  );

  it('every alias in the legacy label map resolves to a canonical pillar name', () => {
    const start = CARD_SRC.indexOf('const CATEGORY_LABELS');
    expect(start).toBeGreaterThan(-1);
    const slice = CARD_SRC.slice(start, CARD_SRC.indexOf('};', start));
    const values = [...slice.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(isCanonicalCategoryLabel(v)).toBe(true);
  });
});
