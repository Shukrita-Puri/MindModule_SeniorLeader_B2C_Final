import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shouldAttachImpersonation, getActiveImpersonationToken } from './impersonationInterceptor';

describe('shouldAttachImpersonation', () => {
  it('attaches for user-facing function names', () => {
    expect(shouldAttachImpersonation('generate-brief')).toBe(true);
    expect(shouldAttachImpersonation('compute-daily-intelligence')).toBe(true);
  });
  it('does NOT attach for admin function names', () => {
    expect(shouldAttachImpersonation('admin-list-users')).toBe(false);
    expect(shouldAttachImpersonation('admin-start-impersonation')).toBe(false);
    expect(shouldAttachImpersonation('admin-end-impersonation')).toBe(false);
  });
  it('does not attach for empty name', () => {
    expect(shouldAttachImpersonation('')).toBe(false);
  });
});

describe('getActiveImpersonationToken', () => {
  const KEY = 'mm.admin.impersonation.v1';
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('returns null when no session stored', () => {
    expect(getActiveImpersonationToken()).toBeNull();
  });

  it('returns token when valid & unexpired', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      token: 'abc.def.ghi',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }));
    expect(getActiveImpersonationToken()).toBe('abc.def.ghi');
  });

  it('returns null when expired', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      token: 'abc.def.ghi',
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    }));
    expect(getActiveImpersonationToken()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    sessionStorage.setItem(KEY, 'not-json');
    expect(getActiveImpersonationToken()).toBeNull();
  });
});