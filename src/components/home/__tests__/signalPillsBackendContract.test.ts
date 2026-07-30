import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INDEX_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/compute-outer-readiness/index.ts'),
  'utf8',
);

const DERIVE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/signal-pills/derive-pills.ts'),
  'utf8',
);

describe('signal pills backend contract · extracted ownership', () => {
  it('index.ts imports and calls derivePills plus finalizePills', () => {
    expect(INDEX_SRC).toContain('derivePills,');
    expect(INDEX_SRC).toContain('finalizePills,');
    expect(INDEX_SRC).toContain('const pillDerivation = derivePills({');
    expect(INDEX_SRC).toContain('const pillFinalized = finalizePills({');
  });

  it('derive-pills.ts owns Physical Reserves contributors and excludes sleep', () => {
    const prSlice = DERIVE_SRC.slice(
      DERIVE_SRC.indexOf('key: "physical_reserves"'),
      DERIVE_SRC.indexOf('key: "resilience_capacity"'),
    );
    expect(prSlice).toContain('contributors: { rhrValue, hrValue }');
    expect(prSlice).not.toContain('sleepDuration');
    expect(prSlice).not.toContain('sleepScore');
  });

  it('derive-pills.ts keeps self-report and wearable provenance separated', () => {
    expect(DERIVE_SRC).toContain('if (clarityLevel != null) decisionSources.push("checkin")');
    expect(DERIVE_SRC).toContain('if (rhrValue != null || hrValue != null) physicalSources.push("wearable")');
    expect(DERIVE_SRC).toContain('physicalSources.push("pattern")');
    expect(DERIVE_SRC).toContain('resilienceSources.push("checkin")');
    expect(DERIVE_SRC).toContain('resilienceSources.push("pattern")');
  });

  it('derive-pills.ts sets contributedByCheckIn only when wearable and check-in are both fresh', () => {
    expect(DERIVE_SRC).toContain(
      'wearableFreshForGate && checkInFreshForGate && hasCheckinSrc',
    );
  });

  it('index.ts uses finalized.pills as the canonical downstream payload', () => {
    expect(INDEX_SRC).toContain('finalized: pillFinalized.pills,');
    expect(INDEX_SRC).toContain('assessmentSignalPillsPayload = assessmentContext.pills.finalized as any[];');
    expect(INDEX_SRC).toContain('echoedSignalPills = assessmentSignalPillsPayload;');
    expect(INDEX_SRC).toContain('const signalPillsPayload = assessmentSignalPillsPayload ?? echoedSignalPills ?? null;');
    expect(INDEX_SRC).toContain('signalPills: signalPillsPayload,');
    expect(INDEX_SRC).toContain('refined_signal_pills: suppressScorePayload ? null : signalPillsPayload,');
    expect(INDEX_SRC).toContain('baseline_signal_pills: suppressScorePayload ? null : signalPillsPayload,');
  });

  it('index.ts carries finalized qualifiers and coherence into response and persistence validation', () => {
    expect(INDEX_SRC).toContain('echoedPillCoherence = assessmentContext.pills.coherence;');
    expect(INDEX_SRC).toContain('echoedPillQualifiers = assessmentContext.pills.qualifiers;');
    expect(INDEX_SRC).toContain('echoedCoherenceWarning = assessmentContext.pills.coherenceWarning;');
    expect(INDEX_SRC).toContain('buildPillContextFromAssessment(assessmentContext)');
    expect(INDEX_SRC).toContain('const finalPillContext = assessmentContext');
  });

  it('index.ts still treats only same-day wearable data as fresh for pill scoring', () => {
    expect(INDEX_SRC).toContain('const wearableFreshForGate = hasTodayWearableData === true;');
    expect(INDEX_SRC).not.toContain('const wearableFreshForGate = hasWearableData === true;');
  });
});
