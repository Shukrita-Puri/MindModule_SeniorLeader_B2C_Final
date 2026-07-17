import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PillDetailContent, { type PillTooltipPill } from '@/components/home/PillTooltip';

const makePill = (
  overrides: Partial<PillTooltipPill> = {},
): PillTooltipPill => ({
  key: 'physical_reserves',
  label: 'Physical Reserves',
  tier: 'green',
  tierLabel: 'Body Steady',
  isScoreBearing: true,
  freshness: 'fresh',
  hiddenReason: null,
  contributors: {},
  ...overrides,
});

describe('PillDetailContent · physical_reserves contract', () => {
  it('RHR + HR contributors render as their own rows (no sleep — W1)', () => {
    render(
      <PillDetailContent
        pill={makePill({
          contributors: {
            rhrValue: 58,
            hrValue: 72,
          },
        })}
      />,
    );
    expect(screen.getByText('RHR')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.queryByText('Sleep Duration')).toBeNull();
    expect(screen.queryByText('Sleep Score')).toBeNull();
    expect(screen.queryByText(/not available for this reading/i)).toBeNull();
  });

  it('partial contributors → RHR renders, HR shows honest missing row', () => {
    render(
      <PillDetailContent
        pill={makePill({ contributors: { rhrValue: 60 } })}
      />,
    );
    expect(screen.getByText('RHR')).toBeInTheDocument();
    // Only HR is expected under physical_reserves now — Sleep rows must
    // never appear here.
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.queryByText('Sleep Duration')).toBeNull();
    expect(screen.queryByText('Sleep Score')).toBeNull();
    expect(screen.queryByText(/not available for this reading/i)).toBeNull();
  });

  it('empty contributors + non-neutral tier → single neutral line, no fake missing wall', () => {
    render(<PillDetailContent pill={makePill({ contributors: {} })} />);
    expect(
      screen.getByText('Body detail not available for this reading.'),
    ).toBeInTheDocument();
    // The wall of "No … available" rows must not appear.
    expect(screen.queryByText(/No sleep duration available/i)).toBeNull();
    expect(screen.queryByText(/No RHR data available/i)).toBeNull();
  });

  it('legacy-only suppressed contributors → treated as empty, neutral fallback', () => {
    render(
      <PillDetailContent
        pill={makePill({
          // Legacy keys the tooltip intentionally suppresses.
          contributors: {
            rhrDeviation: 4,
            sleepDeviation: -12,
          } as any,
        })}
      />,
    );
    expect(
      screen.getByText('Body detail not available for this reading.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No RHR data available/i)).toBeNull();
  });

  it('empty contributors + neutral tier → existing "expected missing" behaviour preserved', () => {
    render(
      <PillDetailContent
        pill={makePill({ tier: 'neutral', tierLabel: 'Body Unread', contributors: {} })}
      />,
    );
    // Neutral tier keeps the honest "missing" rows so users see what's absent.
    expect(screen.getByText(/No RHR data available/i)).toBeInTheDocument();
    expect(screen.getByText(/No HR data available/i)).toBeInTheDocument();
    // Sleep is not expected under Physical Reserves anymore.
    expect(screen.queryByText(/No sleep duration available/i)).toBeNull();
    expect(screen.queryByText(/No sleep score available/i)).toBeNull();
    expect(
      screen.queryByText('Body detail not available for this reading.'),
    ).toBeNull();
  });

  it('legacy snapshot sleep keys under Physical Reserves are ignored', () => {
    render(
      <PillDetailContent
        pill={makePill({
          // Legacy backend payload that still ships sleep under
          // physical_reserves must not surface any Sleep rows.
          contributors: { sleepDuration: 420, sleepScore: 78, rhrValue: 60 } as any,
        })}
      />,
    );
    expect(screen.getByText('RHR')).toBeInTheDocument();
    expect(screen.queryByText('Sleep Duration')).toBeNull();
    expect(screen.queryByText('Sleep Score')).toBeNull();
  });
});