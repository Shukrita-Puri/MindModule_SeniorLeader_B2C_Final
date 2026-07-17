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

describe('PillDetailContent · Sprint B contributor rendering', () => {
  it('decision_readiness renders raw clarityLevel from contributors', () => {
    render(
      <PillDetailContent
        pill={make({
          contributors: { hrvValue: 55, sleepDuration: 450, sleepScore: 80, clarityLevel: 4 },
        })}
      />,
    );
    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    // No fake "No check-in yet" fallback when clarity is present.
    expect(screen.queryByText(/No check-in yet/i)).toBeNull();
  });

  it('resilience_capacity renders emotion/regulation/pressure/sleepEfficiency from contributors', () => {
    render(
      <PillDetailContent
        pill={make({
          key: 'resilience_capacity',
          label: 'Resilience Capacity',
          tierLabel: 'Reserve Strong',
          contributors: {
            sleepEfficiency: 88,
            emotionLevel: 4,
            regulationLevel: 3,
            pressureLevel: 2,
          },
        })}
      />,
    );
    expect(screen.getByText('Sleep Efficiency')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('Emotion')).toBeInTheDocument();
    expect(screen.getByText('Regulation')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
    expect(screen.queryByText(/No check-in yet/i)).toBeNull();
  });

  it('physical_reserves renders RHR + HR rows only (no sleep — W1)', () => {
    render(
      <PillDetailContent
        pill={make({
          key: 'physical_reserves',
          label: 'Physical Reserves',
          tierLabel: 'Body Steady',
          contributors: { sleepDuration: 480, sleepScore: 84, rhrValue: 56, hrValue: 70 },
        })}
      />,
    );
    expect(screen.getByText('RHR')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.queryByText('Sleep Duration')).toBeNull();
    expect(screen.queryByText('Sleep Score')).toBeNull();
  });
});