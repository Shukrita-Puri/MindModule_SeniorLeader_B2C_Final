/**
 * Sprint 1 (Phase 1) guard.
 *
 * `src/components/insights/LeadershipPatternsCard.tsx` aggregates historical
 * Brief snapshots for baseline / friction comparisons and MUST request only
 * DELIVERED briefs from the `brief-history` edge function.
 *
 * Documented exception: `src/services/mrsDailySeries.ts` powers the weekly
 * streak dots and the Insights trend chart. There a generated-but-unopened
 * brief is still a real reading of that day, so it deliberately does NOT pass
 * delivered=1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const CALL_SITES = ['src/components/insights/LeadershipPatternsCard.tsx'];

describe('brief-history delivered-only guard', () => {
  for (const rel of CALL_SITES) {
    it(`${rel} requests brief-history with delivered=1`, () => {
      const raw = readFileSync(join(process.cwd(), rel), 'utf8');
      // Collapse whitespace so URL template literals split across lines
      // still match the guard pattern.
      const src = raw.replace(/\s+/g, ' ');
      // Sanity: file actually calls brief-history.
      expect(src).toMatch(/brief-history/);
      // Guard: every brief-history URL must carry delivered=1.
      expect(src).toMatch(/brief-history.{0,500}delivered=1/);
      // Regression: no bare functions.invoke('brief-history') without a
      // delivered flag in body (invoke can't send query params, so we
      // banned that pattern here — must use fetch).
      const invokeMatches = src.match(/functions\.invoke\((['"])brief-history\1/g) || [];
      expect(
        invokeMatches.length,
        `${rel} still uses supabase.functions.invoke('brief-history') — invoke cannot pass delivered=1 as a query param; switch to fetch(...).`,
      ).toBe(0);
    });
  }

  it('the shared MRS daily series intentionally includes undelivered briefs', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/mrsDailySeries.ts'), 'utf8');
    expect(src).toMatch(/brief-history/);
    expect(src).not.toMatch(/delivered=1/);
  });
});
