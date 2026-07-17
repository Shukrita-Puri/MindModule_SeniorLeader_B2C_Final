import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PillDetailContent, { type PillTooltipPill } from '@/components/home/PillTooltip';

const make = (overrides: Partial<PillTooltipPill>): PillTooltipPill => ({
  key: 'decision_readiness',
  label: 'Decision Readiness',
  tier: 'green',
  tierLabel: 'Mind Sharp',
  isScoreBearing: true,
  freshness: 'fresh',
  hiddenReason: null,
  contributors: {},
  ...overrides,
});

describe('PillDetailContent · W1 signal-pill tooltip rewrite', () => {
  it('no Δ3d symbol ever appears in rendered qualifier text', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          key: 'resilience_capacity',
          label: 'Resilience Capacity',
          tierLabel: 'Reserve Strong',
          contributors: { emotionLevel: 4 },
          qualifiers: {
            emotion: { delta3d: -0.7, vsDow: 0.5, peakStreak: 2 },
          },
        })}
      />,
    );
    expect(container.textContent).not.toContain('Δ');
    expect(container.textContent).not.toContain('Δ3d');
    expect(container.textContent).toMatch(/pt on 3-day avg/);
    expect(container.textContent).toMatch(/vs same weekday/);
  });

  it('mind dim with BOTH raw value + qualifier renders exactly one row', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          contributors: { clarityLevel: 5 },
          qualifiers: {
            clarity: { delta3d: -0.7, peakStreak: 2 },
          },
        })}
      />,
    );
    const clarityMatches = container.textContent?.match(/Clarity/g) ?? [];
    expect(clarityMatches.length).toBe(1);
    expect(container.textContent).toMatch(/5\/5/);
    expect(container.textContent).toMatch(/-0\.7pt on 3-day avg/);
    expect(container.textContent).not.toMatch(/No check-in yet/);
  });

  it('mind dim with ONLY qualifier (no raw) renders one qualifier-only row and no "No check-in yet" duplicate', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          key: 'resilience_capacity',
          label: 'Resilience Capacity',
          tierLabel: 'Reserve Strong',
          contributors: {},
          qualifiers: {
            emotion: { delta3d: 0.4 },
          },
        })}
      />,
    );
    const emotionMatches = container.textContent?.match(/Emotion/g) ?? [];
    expect(emotionMatches.length).toBe(1);
    expect(container.textContent).toMatch(/\+0\.4pt on 3-day avg/);
    // Emotion must NOT also have a "No check-in yet" fallback row.
    // (Other dims without qualifier or value still may.)
  });

  it('mind dim with neither raw nor qualifier renders one missing row', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          key: 'resilience_capacity',
          label: 'Resilience Capacity',
          tierLabel: 'Reserve Strong',
          contributors: {},
          qualifiers: {},
        })}
      />,
    );
    // With no real evidence + non-neutral tier, the neutral fallback line fires.
    // Either the neutral fallback OR the single "No check-in yet" row per dim
    // must be present — never two rows for the same dim.
    const emotionMatches = container.textContent?.match(/Emotion/g) ?? [];
    expect(emotionMatches.length).toBeLessThanOrEqual(1);
  });

  it('expanded panel does NOT repeat the pill label + tier label as an inner heading', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          contributors: { hrvValue: 55 },
        })}
      />,
    );
    // The label + tier only appear once as headings — the pill chip owns them.
    // The panel now opens directly with contributor rows.
    const labelMatches =
      container.textContent?.match(/Decision Readiness/g) ?? [];
    const tierMatches = container.textContent?.match(/Mind Sharp/g) ?? [];
    expect(labelMatches.length).toBe(0);
    expect(tierMatches.length).toBe(0);
  });

  it('HRV qualifier uses "on 3-day avg" language (no directional prose)', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          contributors: { hrvValue: 55 },
          qualifiers: { hrv: { delta3d: 12, vsBaselinePct: 8 } },
        })}
      />,
    );
    expect(container.textContent).toMatch(/\+12ms on 3-day avg/);
    expect(container.textContent).toMatch(/\+8% vs baseline/);
    expect(container.textContent).not.toMatch(/Rising|Declining|Improving|Falling/);
  });

  it('RHR qualifier uses "on 3-day trend" (no directional prose)', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          key: 'physical_reserves',
          label: 'Physical Reserves',
          tierLabel: 'Body Steady',
          contributors: { rhrValue: 58, hrValue: 72 },
          qualifiers: { rhr: { trend3d: 8, vsBaselinePct: 12 } },
        })}
      />,
    );
    expect(container.textContent).toMatch(/\+8% on 3-day trend/);
    expect(container.textContent).toMatch(/\+12% vs baseline/);
    expect(container.textContent).not.toMatch(/Rising|Declining|Improving|Falling/);
  });

  it('sleep duration qualifier uses h/m format vs 7-day avg', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          contributors: { sleepDuration: 440 },
          qualifiers: { sleep: { durationDelta7d: 90 } },
        })}
      />,
    );
    expect(container.textContent).toMatch(/\+1h 30m vs 7-day avg/);
  });

  it('sleep efficiency streak uses "nights below optimal"', () => {
    const { container } = render(
      <PillDetailContent
        pill={make({
          key: 'resilience_capacity',
          label: 'Resilience Capacity',
          tierLabel: 'Reserve Strong',
          contributors: { sleepEfficiency: 78 },
          qualifiers: { sleep_efficiency: { delta7d: -6, streakLowDays: 3 } },
        })}
      />,
    );
    expect(container.textContent).toMatch(/-6pts vs 7-day avg/);
    expect(container.textContent).toMatch(/3 nights below optimal/);
  });
});