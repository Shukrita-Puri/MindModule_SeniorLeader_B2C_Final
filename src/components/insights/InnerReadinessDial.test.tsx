import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/hooks/useOuterReadiness', () => ({
  useOuterReadiness: () => ({
    data: {
      innerReadinessScore: null,
      innerReadinessState: 'awaiting',
      innerReadinessTier: null,
    },
  }),
}));

vi.mock('@/hooks/useMrsTrend', () => ({
  useMrsTrend: () => ({
    loading: false,
    data: { history: [], caption: 'Building your trend history', trajectoryCaption: 'Building your 6-month trajectory' },
  }),
}));

vi.mock('@/components/home/mrs/MrsSparkline', () => ({
  default: () => null,
}));

vi.mock('@/services/authTokenService', () => ({
  getAuthToken: async () => null,
}));

describe('InnerReadinessDial', () => {
  it('renders awaiting state with neutral copy', async () => {
    const { default: InnerReadinessDial } = await import('./InnerReadinessDial');
    render(<InnerReadinessDial />);

    expect(screen.getByText('Awaiting data')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.getByText('No recent wearable data — sync in Connected Data, or check in to take a self-assessment.'),
    ).toBeInTheDocument();
  });
});
