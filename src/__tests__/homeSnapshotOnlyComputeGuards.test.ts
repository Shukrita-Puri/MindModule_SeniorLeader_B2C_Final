import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('MRS single-source: server read-first', () => {
  const SRC = read('supabase/functions/compute-outer-readiness/index.ts');

  it('adopts the existing ready snapshot for non-internal (browser) callers', () => {
    expect(SRC).toContain(
      'const adoptExistingMrs = existingIsReadyRow && !isInternalCall',
    );
    expect(SRC).toMatch(
      /shouldPreserveExistingMrs\s*=\s*\(suppressIncomingMrsSnapshot \|\| adoptExistingMrs\)/,
    );
  });

  it('logs adoption for observability', () => {
    expect(SRC).toContain('[canonical-mrs] adopted_existing_snapshot');
  });
});

describe('MRS single-source: client compute suppression', () => {
  const ENGINE = read('src/utils/energyStateEngine.ts');

  it('computeEnergyState accepts a snapshotOnly option and returns a stub', () => {
    expect(ENGINE).toContain("import { HOME_SNAPSHOT_ONLY } from '@/config/homeSnapshotMode'");
    expect(ENGINE).toMatch(
      /if \(options\?\.snapshotOnly === true && HOME_SNAPSHOT_ONLY\) \{\s*\n\s*return buildSnapshotOnlyStub\(\);/,
    );
  });

  it('stub carries every non-nullable field consumers read without a guard', () => {
    const stub = ENGINE.split('function buildSnapshotOnlyStub')[1]?.split('export async function computeEnergyState')[0] ?? '';
    expect(stub).toContain("energyTier: 'managing'");
    expect(stub).toContain("engineStatus: 'stale'");
    expect(stub).toContain('overallBalance: null');
    expect(stub).toContain("recommendationPriority: 'managing'");
    expect(stub).toContain("divergenceFlag: 'ALIGNED'");
  });

  it('short-circuits before the cache and before any edge-function invoke', () => {
    const fn = ENGINE.split('export async function computeEnergyState')[1] ?? '';
    const stubIdx = fn.indexOf('return buildSnapshotOnlyStub()');
    const cacheIdx = fn.indexOf('energyStateCache.get');
    expect(stubIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(stubIdx);
  });

  it('home surfaces pass snapshotOnly; coach surfaces stay on the live path', () => {
    for (const p of [
      'src/components/home/TodayStateCard.tsx',
      'src/components/home/DailyRitualCard.tsx',
      'src/components/home/JustInTimeIntervention.tsx',
      'src/components/home/RecommendedPlan.tsx',
      'src/components/home/PerformancePreparation.tsx',
    ]) {
      expect(read(p)).toMatch(/computeEnergyState\([^)]*\{ snapshotOnly: true \}\)/);
    }
    for (const p of ['src/hooks/useCoachConversation.ts', 'src/utils/coachContextBuilder.ts']) {
      expect(read(p)).not.toContain('snapshotOnly');
    }
  });
});
