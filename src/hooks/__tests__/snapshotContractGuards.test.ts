import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sanitizeSignalPillsForCheckInFreshness,
} from '../useCurrentBriefSnapshot';
import { hasFreshScoreBearingSignal } from '../useMrsSnapshot';

const BRIEF_SRC = readFileSync(
  join(process.cwd(), 'src/components/home/DecisionReadinessBrief.tsx'),
  'utf8',
);

describe('snapshot contract guards', () => {
  it('strips check-in contributors when no current check-in exists', () => {
    const sanitized = sanitizeSignalPillsForCheckInFreshness(
      [
        {
          key: 'decision_readiness',
          contributors: {
            hrvValue: 52,
            clarityLevel: 5,
          },
          contributedByCheckIn: true,
        },
        {
          key: 'resilience_capacity',
          contributors: {
            emotionLevel: 4,
            pressureLevel: 2,
            sleepEfficiency: 88,
          },
          contributedByCheckIn: true,
        },
      ],
      false,
    ) as Array<any>;

    expect(sanitized[0].contributors).toEqual({ hrvValue: 52 });
    expect(sanitized[0].contributedByCheckIn).toBe(false);
    expect(sanitized[1].contributors).toEqual({ sleepEfficiency: 88 });
    expect(sanitized[1].contributedByCheckIn).toBe(false);
  });

  it('preserves contributors when a current check-in exists', () => {
    const original = [
      {
        key: 'decision_readiness',
        contributors: { hrvValue: 52, clarityLevel: 5 },
        contributedByCheckIn: true,
      },
    ];
    expect(sanitizeSignalPillsForCheckInFreshness(original, true)).toBe(original);
  });

  it('only treats fresh score-bearing pills as renderable MRS evidence', () => {
    expect(
      hasFreshScoreBearingSignal([
        { key: 'decision_readiness', isScoreBearing: true, freshness: 'fresh' },
      ]),
    ).toBe(true);

    expect(
      hasFreshScoreBearingSignal([
        { key: 'decision_readiness', isScoreBearing: false, freshness: 'stale' },
      ]),
    ).toBe(false);

    expect(
      hasFreshScoreBearingSignal([
        { key: 'decision_readiness', isScoreBearing: true, freshness: 'stale' },
      ]),
    ).toBe(false);

    expect(hasFreshScoreBearingSignal([])).toBe(false);
    expect(hasFreshScoreBearingSignal(null)).toBe(false);
  });

  it('brief merge re-sanitizes chosen pills before render', () => {
    expect(BRIEF_SRC).toContain('const chosenPills = sanitizeSignalPillsForCheckInFreshness(');
  });

  it('brief readiness label follows the same MRS snapshot state that owns the score', () => {
    expect(BRIEF_SRC).toContain('const canonicalReadinessState =');
    expect(BRIEF_SRC).toContain("canonicalReadinessState === 'refined'");
    expect(BRIEF_SRC).toContain("canonicalReadinessState === 'awaiting' || score == null");
  });

  it('brief card has no competing MRS snapshot score source', () => {
    expect(BRIEF_SRC).not.toContain('shouldPreferMrsSnapshot');
    // The MRS snapshot may only be consumed for the shared visibility gate —
    // never as a second score source for the rendered readiness number.
    expect(BRIEF_SRC).toContain('isMrsVisible(briefMrsSnapshot');
    expect(BRIEF_SRC).not.toContain('briefMrsSnapshot.score');
    expect(BRIEF_SRC).not.toContain('briefMrsSnapshot?.score');
  });
});

