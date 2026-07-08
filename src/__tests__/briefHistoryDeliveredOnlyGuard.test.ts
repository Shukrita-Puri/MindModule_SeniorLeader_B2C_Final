/**
 * Sprint 1 (Phase 1) guard.
 *
 * Two insights surfaces aggregate historical Brief snapshots for the weekly
 * readiness dial + baseline/current comparison:
 *   - src/components/insights/InnerReadinessDial.tsx
 *   - src/components/insights/LeadershipPatternsCard.tsx
 *
 * Both MUST request only DELIVERED briefs from the `brief-history` edge
 * function. Undelivered snapshot rows (generated but never rendered to the
 * user) must not leak into trend/baseline/friction calculations.
 *
 * The edge function reads `delivered=1` from the query string. This test
 * proves both call sites include that flag in the URL they build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const CALL_SITES = [
  'src/components/insights/InnerReadinessDial.tsx',
  'src/components/insights/LeadershipPatternsCard.tsx',
];

describe('brief-history delivered-only guard', () => {
  for (const rel of CALL_SITES) {
    it(`${rel} requests brief-history with delivered=1`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      // Sanity: file actually calls brief-history.
      expect(src).toMatch(/brief-history/);
      // Guard: every brief-history URL must carry delivered=1.
      expect(src).toMatch(/brief-history[^\n]*delivered=1/);
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
});