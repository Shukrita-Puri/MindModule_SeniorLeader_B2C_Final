/**
 * Guard: the profile popover must expose a single "Subscription" entry point
 * and no redundant "Upgrade Plan" item (web and iOS alike).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
  SidebarMenuButton: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@mindmodule.me', name: 'Test User' },
    loading: false,
    signOut: vi.fn(),
  }),
}));

import { UserSettingsPopover } from '@/components/navigation/UserSettingsPopover';

describe('UserSettingsPopover subscription entry point', () => {
  it('renders Subscription but not Upgrade Plan', async () => {
    render(
      <MemoryRouter>
        <UserSettingsPopover />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByText('Test User'));

    expect(await screen.findByText('Subscription')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade Plan')).not.toBeInTheDocument();
  });
});
