import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import HomeRelocationPrompt from '@/components/profile/HomeRelocationPrompt';
function Destination() { const location = useLocation(); return <output>{location.pathname}{location.hash}</output>; }
const prompt = { title: "You've been based somewhere new", body: 'Your last 8 weeks have mostly been outside your saved home area.' };
describe('home relocation actions', () => {
  it('updates by opening the Profile home-location section after acknowledgement', async () => {
    const respond = vi.fn().mockResolvedValue(true);
    render(<MemoryRouter initialEntries={['/executive-home']}><Destination /><HomeRelocationPrompt prompt={prompt} saving={false} error={null} respond={respond} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Update home location' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith('update'));
    await waitFor(() => expect(screen.getByText('/profile#home-location')).toBeDefined());
  });
  it('Not now and Keep Home send their distinct cross-device choices', async () => {
    const respond = vi.fn().mockResolvedValue(true);
    render(<MemoryRouter><HomeRelocationPrompt prompt={prompt} saving={false} error={null} respond={respond} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(respond).toHaveBeenCalledWith('not_now');
    fireEvent.click(screen.getByRole('button', { name: 'Keep Home' }));
    expect(respond).toHaveBeenCalledWith('keep_home');
  });
  it('does not navigate when saving the choice fails', async () => {
    const respond = vi.fn().mockResolvedValue(false);
    render(<MemoryRouter initialEntries={['/executive-home']}><Destination /><HomeRelocationPrompt prompt={prompt} saving={false} error={null} respond={respond} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Update home location' }));
    await waitFor(() => expect(respond).toHaveBeenCalled());
    expect(screen.getByText('/executive-home')).toBeDefined();
  });
});