import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeRelocationPrompt } from '../useHomeRelocationPrompt';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), remove: vi.fn(),
  resume: undefined as undefined | ((state: { isActive: boolean }) => void),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('@/services/authTokenService', () => ({ getAuthToken: async () => 'test-only-token' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: (_event: string, cb: typeof mocks.resume) => {
  mocks.resume = cb;
  return Promise.resolve({ remove: mocks.remove });
} } }));
const prompt = { title: 'Home location', body: 'Confirmed away history' };

describe('shared home relocation lifecycle', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.remove.mockReset();
    mocks.resume = undefined;
  });
  for (const action of ['not_now', 'keep_home', 'update'] as const) {
    it(`${action} saves through the authenticated service and reads saved state on reopening`, async () => {
      let saved = false;
      mocks.invoke.mockImplementation(async (_name, options) => {
        if (options.body) { saved = true; return { data: { ok: true }, error: null }; }
        return { data: { prompt: saved ? null : prompt }, error: null };
      });
      const first = renderHook(() => useHomeRelocationPrompt());
      await waitFor(() => expect(first.result.current.prompt).toEqual(prompt));
      await act(async () => { expect(await first.result.current.respond(action)).toBe(true); });
      expect(mocks.invoke).toHaveBeenCalledWith('home-relocation-prompt', {
        body: { action }, headers: { Authorization: 'Bearer test-only-token' },
      });
      expect(first.result.current.prompt).toBeNull();
      first.unmount();
      const reopened = renderHook(() => useHomeRelocationPrompt());
      await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3));
      expect(reopened.result.current.prompt).toBeNull();
      reopened.unmount();
    });
  }
  it('rechecks on web visibility and shared iOS/Android foreground events', async () => {
    mocks.invoke.mockResolvedValue({ data: { prompt }, error: null });
    const hook = renderHook(() => useHomeRelocationPrompt());
    await waitFor(() => expect(hook.result.current.prompt).toEqual(prompt));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    await act(async () => { mocks.resume?.({ isActive: false }); });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await act(async () => { mocks.resume?.({ isActive: true }); });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(3));
    hook.unmount();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
  });
  it('keeps the popup visible when saving a dismissal fails', async () => {
    mocks.invoke.mockImplementation(async (_name, options) => options.body
      ? { data: null, error: new Error('save failed') }
      : { data: { prompt }, error: null });
    const hook = renderHook(() => useHomeRelocationPrompt());
    await waitFor(() => expect(hook.result.current.prompt).toEqual(prompt));
    await act(async () => { expect(await hook.result.current.respond('not_now')).toBe(false); });
    expect(hook.result.current.prompt).toEqual(prompt);
    expect(hook.result.current.error).not.toBeNull();
    hook.unmount();
  });
});