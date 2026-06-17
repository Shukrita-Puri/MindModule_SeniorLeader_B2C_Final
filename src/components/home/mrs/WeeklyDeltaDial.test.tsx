import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeeklyDeltaDial from './WeeklyDeltaDial';

describe('WeeklyDeltaDial', () => {
  it('renders suppression text when comparison is unavailable', () => {
    render(<WeeklyDeltaDial delta={null} mode="baseline" reason="composition_mismatch" />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('not enough to compare yet')).toBeInTheDocument();
  });
});
