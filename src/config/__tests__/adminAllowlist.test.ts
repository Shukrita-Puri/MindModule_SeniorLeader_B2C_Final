import { describe, it, expect } from 'vitest';
import { ADMIN_EMAIL_ALLOWLIST, isAllowlistedAdminEmail } from '@/config/adminAllowlist';

describe('admin allowlist', () => {
  it('contains exactly the two authorized emails', () => {
    expect(ADMIN_EMAIL_ALLOWLIST).toEqual([
      'shukrita@mindmodule.me',
      'itsmanojkdev@gmail.com',
    ]);
  });

  it('matches case-insensitively and ignores whitespace', () => {
    expect(isAllowlistedAdminEmail('Shukrita@MindModule.me')).toBe(true);
    expect(isAllowlistedAdminEmail('  itsmanojkdev@gmail.com  ')).toBe(true);
  });

  it('rejects every other email', () => {
    expect(isAllowlistedAdminEmail(null)).toBe(false);
    expect(isAllowlistedAdminEmail(undefined)).toBe(false);
    expect(isAllowlistedAdminEmail('')).toBe(false);
    expect(isAllowlistedAdminEmail('attacker@mindmodule.me')).toBe(false);
    expect(isAllowlistedAdminEmail('shukrita@example.com')).toBe(false);
  });
});