import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const refreshHook = read('src/hooks/useExecutiveHomeCardsRefresh.ts');
const outerReadiness = read('src/hooks/useOuterReadiness.ts');
const mrsSnapshot = read('src/hooks/useMrsSnapshot.ts');
const brief = read('src/components/home/DecisionReadinessBrief.tsx');
const plan = read('src/components/home/TodayThreePriorities.tsx');

describe('manual refresh is one atomic backend operation', () => {
  it('does not arm the client-side live-compute force flag', () => {
    expect(refreshHook).toContain('forceLiveCompute: false');
  });

  it('invokes only build-executive-home-cards', () => {
    expect(refreshHook).toContain("supabase.functions.invoke('build-executive-home-cards'");
    expect(refreshHook).not.toContain("invoke('compute-outer-readiness'");
  });

  it('waits for the three snapshot reads before touching the brief cache', () => {
    const refetchAt = refreshHook.indexOf('refetchQueries');
    const clearAt = refreshHook.indexOf('clearPersistent(cacheKeys.brief(');
    expect(refetchAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(refetchAt);
  });

  it('keeps cache eviction separable from forcing a live compute', () => {
    expect(outerReadiness).toContain('forceLiveCompute?: boolean');
    expect(outerReadiness).toContain('clearPersistentBrief?: boolean');
  });
});

describe('shared readiness gate', () => {
  it('Brief awaiting is decided by MRS visibility alone', () => {
    expect(brief).toContain(
      'const showNeutralAwaitingCopy = !showFailureBlock && !mrsVisible;',
    );
  });

  it('Brief does not wipe its last-good copy while MRS is formed', () => {
    expect(brief).toContain('isTrueAwaitingBrief(outerBriefReal) && !mrsFormed');
  });

  it('Plan still follows the shared MRS gate', () => {
    expect(plan).toContain('const mrsReadyForPlan = isMrsVisible(mrsSnapshot, outerReadinessData as any);');
    const awaitingGateAt = plan.indexOf('if (!mrsReadyForPlan)');
    const loaderAt = plan.indexOf('if (showPlanLoader)');
    expect(awaitingGateAt).toBeGreaterThan(-1);
    expect(loaderAt).toBeGreaterThan(awaitingGateAt);
  });

  it('Plan re-hydrates when a refreshed snapshot arrives', () => {
    expect(plan).toContain('hydratedSnapshotIdentityRef');
  });
});

describe('MRS snapshot resilience', () => {
  it('serves the last renderable snapshot when a read fails', () => {
    expect(mrsSnapshot).toContain('lastGoodMrsSnapshots');
    expect(mrsSnapshot).toContain('servedLastGood');
  });
});
