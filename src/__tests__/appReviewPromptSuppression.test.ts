/**
 * The native rating prompt must never appear on top of onboarding, a purchase
 * sheet, auth, or an error screen. An ill-timed prompt is both a poor
 * reviewer experience and a wasted display (Apple allows only 3 per year).
 */
import { describe, it, expect } from 'vitest';
import { isReviewPromptSuppressedForPath } from '@/services/appReview';

describe('review prompt suppression', () => {
  it.each([
    '/onboarding',
    '/onboarding/app-intro',
    '/upgrade',
    '/upgrade?source=profile-upgrade',
    '/payment',
    '/login',
    '/signup',
    '/callback',
    '/error',
    '/reset-password',
  ])('suppresses on %s', (path) => {
    expect(isReviewPromptSuppressedForPath(path)).toBe(true);
  });

  it.each(['/executive-home', '/plan', '/insights', '/profile', '/recalibrate'])(
    'allows on %s',
    (path) => {
      expect(isReviewPromptSuppressedForPath(path)).toBe(false);
    },
  );

  it('is case-insensitive and tolerates empty input', () => {
    expect(isReviewPromptSuppressedForPath('/Upgrade')).toBe(true);
    expect(isReviewPromptSuppressedForPath('')).toBe(false);
  });
});