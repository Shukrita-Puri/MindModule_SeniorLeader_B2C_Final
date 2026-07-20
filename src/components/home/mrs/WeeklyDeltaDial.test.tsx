import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeeklyDeltaDial from './WeeklyDeltaDial';

describe('WeeklyDeltaDial', () => {
  it('renders suppression text when comparison is unavailable', () => {
    render(<WeeklyDeltaDial currentScore={64} delta={null} lastWeekAvg={null} mode="baseline" reason="composition_mismatch" />);

    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('Building your trend')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
  });

  it('renders numeric progress when a delta exists', () => {
    render(<WeeklyDeltaDial currentScore={64} thisWeekAvg={58} delta={14} lastWeekAvg={44} mode="refined" reason={null} />);

    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
    expect(screen.queryByText('64')).toBeNull();
    expect(screen.getByText('+14')).toBeInTheDocument();
    expect(screen.getByText('refined')).toBeInTheDocument();
    expect(screen.getByText('Trending up')).toBeInTheDocument();
  });
});
