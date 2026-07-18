import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeeklyDeltaDial from './WeeklyDeltaDial';

describe('WeeklyDeltaDial', () => {
  it('renders suppression text when comparison is unavailable', () => {
    render(<WeeklyDeltaDial currentScore={64} delta={null} lastWeekAvg={null} mode="baseline" reason="composition_mismatch" />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Building your trend')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
  });

  it('renders numeric progress when a delta exists', () => {
    render(<WeeklyDeltaDial currentScore={64} delta={14} lastWeekAvg={50} mode="refined" reason={null} />);

    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('+14')).toBeInTheDocument();
    expect(screen.getByText('refined')).toBeInTheDocument();
    expect(screen.getByText('Trending up')).toBeInTheDocument();
  });
});
