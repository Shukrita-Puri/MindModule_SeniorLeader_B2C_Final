import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  annotatePill,
  enforcePillInvariants,
  type PillInput,
  type SourceType,
} from './signal-pills-v4.ts';

const decision: PillInput = {
  key: 'decision_readiness',
  label: 'Decision Readiness',
  tier: 'green',
  tierLabel: 'Mind Sharp',
};
const physical: PillInput = {
  key: 'physical_reserves',
  label: 'Physical Reserves',
  tier: 'amber',
  tierLabel: 'Body Strained',
};
const resilience: PillInput = {
  key: 'resilience_capacity',
  label: 'Resilience Capacity',
  tier: 'green',
  tierLabel: 'Reserve Strong',
};

function annotateAll(
  perPillSources: Record<string, SourceType[]>,
  ctx: { wearableFresh: boolean; checkInFresh: boolean; hasWearable: boolean },
) {
  return [
    annotatePill(decision, perPillSources.decision_readiness ?? [], ctx),
    annotatePill(physical, perPillSources.physical_reserves ?? [], ctx),
    annotatePill(resilience, perPillSources.resilience_capacity ?? [], ctx),
  ];
}

Deno.test('V4 matrix — no wearable + no check-in → all neutral missing', () => {
  const pills = annotateAll(
    { decision_readiness: [], physical_reserves: [], resilience_capacity: [] },
    { wearableFresh: false, checkInFresh: false, hasWearable: false },
  );
  for (const p of pills) {
    assertEquals(p.isScoreBearing, false);
    assertEquals(p.tier, 'neutral');
    assertEquals(p.contributedByCheckIn, false);
    assertEquals(p.hiddenReason, 'no_fresh_wearable');
    assertEquals(p.freshness, 'missing');
  }
});

Deno.test('V4 matrix — no wearable + check-in → still neutral, no check-in credit', () => {
  const pills = annotateAll(
    {
      decision_readiness: ['checkin'],
      physical_reserves: [],
      resilience_capacity: ['checkin'],
    },
    { wearableFresh: false, checkInFresh: true, hasWearable: false },
  );
  for (const p of pills) {
    assertEquals(p.isScoreBearing, false);
    assertEquals(p.tier, 'neutral');
    assertEquals(p.contributedByCheckIn, false);
    assertEquals(p.hiddenReason, 'no_fresh_wearable');
    assertEquals(p.freshness, 'missing');
  }
});

Deno.test('V4 matrix — stale wearable + check-in → neutral stale, no check-in credit', () => {
  const pills = annotateAll(
    {
      decision_readiness: ['wearable', 'checkin'],
      physical_reserves: ['wearable'],
      resilience_capacity: ['checkin'],
    },
    { wearableFresh: false, checkInFresh: true, hasWearable: true },
  );
  for (const p of pills) {
    assertEquals(p.isScoreBearing, false);
    assertEquals(p.tier, 'neutral');
    assertEquals(p.contributedByCheckIn, false);
    assertEquals(p.hiddenReason, 'no_fresh_wearable');
    assertEquals(p.freshness, 'stale');
  }
});

Deno.test('V4 matrix — fresh wearable + no check-in → wearable pills score, check-in-only hidden', () => {
  const pills = annotateAll(
    {
      decision_readiness: ['wearable'],
      physical_reserves: ['wearable'],
      resilience_capacity: ['checkin'],
    },
    { wearableFresh: true, checkInFresh: false, hasWearable: true },
  );
  const [d, ph, r] = pills;
  assertEquals(d.isScoreBearing, true);
  assertEquals(d.contributedByCheckIn, false);
  assertEquals(d.freshness, 'fresh');
  assertEquals(ph.isScoreBearing, true);
  assertEquals(ph.freshness, 'fresh');
  // Resilience only had a check-in source — must be suppressed.
  assertEquals(r.isScoreBearing, false);
  assertEquals(r.tier, 'neutral');
  assertEquals(r.hiddenReason, 'no_checkin');
  assertEquals(r.freshness, 'non_score_bearing');
  assertEquals(r.contributedByCheckIn, false);
});

Deno.test('V4 matrix — fresh wearable + check-in → contributedByCheckIn only where checkin contributed', () => {
  const pills = annotateAll(
    {
      decision_readiness: ['wearable'],
      physical_reserves: ['wearable'],
      resilience_capacity: ['wearable', 'checkin'],
    },
    { wearableFresh: true, checkInFresh: true, hasWearable: true },
  );
  const [d, ph, r] = pills;
  assertEquals(d.contributedByCheckIn, false);
  assertEquals(ph.contributedByCheckIn, false);
  assertEquals(r.contributedByCheckIn, true);
  for (const p of pills) {
    assertEquals(p.isScoreBearing, true);
    assertEquals(p.freshness, 'fresh');
    assertEquals(p.hiddenReason, null);
  }
});

Deno.test('enforcePillInvariants — corrupted score-bearing pill on !wearableFresh is force-neutralised', () => {
  const corrupt = [
    annotatePill(decision, ['wearable'], {
      wearableFresh: true,
      checkInFresh: true,
      hasWearable: true,
    }),
  ];
  // Simulate a downstream mutation that violated the invariant.
  corrupt[0].isScoreBearing = true;
  corrupt[0].contributedByCheckIn = true;
  corrupt[0].tier = 'green';
  const fixed = enforcePillInvariants(corrupt, {
    wearableFresh: false,
    checkInFresh: true,
    hasWearable: true,
  });
  assertEquals(fixed[0].isScoreBearing, false);
  assertEquals(fixed[0].contributedByCheckIn, false);
  assertEquals(fixed[0].tier, 'neutral');
  assertEquals(fixed[0].freshness, 'stale');
});