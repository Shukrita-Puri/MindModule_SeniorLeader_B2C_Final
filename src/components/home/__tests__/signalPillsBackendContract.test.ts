import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sprint B — guard that the edge function persists the raw contributor
 * fields required by the tooltip contract. This is a source-level check
 * (no network) so we can enforce the contributor keys land in the
 * signalPillsPayload literal without booting Deno.
 */
const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/compute-outer-readiness/index.ts'),
  'utf8',
);

describe('compute-outer-readiness signalPillsPayload · Sprint B contributors', () => {
  it("decision_readiness contributors literal includes clarityLevel", () => {
    // Loose but strict-enough: the DR block sits above the physical_reserves
    // block, so verify both keys appear before "physical_reserves".
    const drSlice = SRC.slice(
      SRC.indexOf("key: 'decision_readiness'"),
      SRC.indexOf("key: 'physical_reserves'"),
    );
    expect(drSlice).toContain('hrvValue');
    expect(drSlice).toContain('sleepDuration');
    expect(drSlice).toContain('sleepScore: sleepScoreVal');
    expect(drSlice).toContain('clarityLevel');
  });

  it("physical_reserves contributors literal is RHR + HR (no sleep — W1)", () => {
    const prSlice = SRC.slice(
      SRC.indexOf("key: 'physical_reserves'"),
      SRC.indexOf("key: 'resilience_capacity'"),
    );
    expect(prSlice).toContain('rhrValue');
    expect(prSlice).toContain('hrValue');
    // Sleep belongs to Decision Readiness only.
    expect(prSlice).not.toMatch(/sleepDuration,/);
    expect(prSlice).not.toContain('sleepScore: sleepScoreVal');
  });

  it("resilience_capacity contributors literal includes sleepEfficiency + emotion/regulation/pressure + pattern fields", () => {
    const rcStart = SRC.indexOf("key: 'resilience_capacity'");
    const rcSlice = SRC.slice(rcStart, rcStart + 2000);
    expect(rcSlice).toContain('sleepEfficiency');
    expect(rcSlice).toContain('emotionLevel');
    expect(rcSlice).toContain('regulationLevel');
    expect(rcSlice).toContain('pressureLevel');
    expect(rcSlice).toContain('sustainedDeficit');
    expect(rcSlice).toContain('hrvHighDemandCooccurrence7d');
    expect(rcSlice).toContain('protectionGoalsCount');
  });

  it('sourceTypes derivation covers wearable, checkin, and pattern buckets', () => {
    // Existence of the three source arrays and the union assignment.
    expect(SRC).toContain("decisionSources.push('wearable')");
    expect(SRC).toContain("decisionSources.push('checkin')");
    expect(SRC).toContain("physicalSources.push('wearable')");
    expect(SRC).toContain("physicalSources.push('pattern')");
    expect(SRC).toContain("resilienceSources.push('wearable')");
    expect(SRC).toContain("resilienceSources.push('checkin')");
    expect(SRC).toContain("resilienceSources.push('pattern')");
    expect(SRC).toContain('(p as any).sourceTypes = sources');
  });

  it('contributedByCheckIn is set only when wearable + check-in are both fresh', () => {
    expect(SRC).toContain('wearableFreshForGate && checkInFreshForGate && hasCheckinSrc');
  });

  it('treats only same-day wearable data as fresh for pill scoring', () => {
    expect(SRC).toContain('const wearableFreshForGate = hasTodayWearableData === true;');
    expect(SRC).not.toContain('const wearableFreshForGate = hasWearableData === true;');
  });
});
