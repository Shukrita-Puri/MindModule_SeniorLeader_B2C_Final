/**
 * Preview-Safe Auth Detection
 *
 * The Lovable editor / shared preview URLs render the app inside an iframe
 * with no real Auth0 session. We don't want logged-out reviewers to see
 * blank cards or spinning loaders on data-driven screens.
 *
 * `isPreviewContext()` returns true when:
 *   - DEV_MODE flag is on, OR
 *   - the app is mounted in an iframe (Lovable preview / sandbox), OR
 *   - the host is a Lovable preview domain (`*.lovable.app`).
 *
 * Components can call `shouldUsePreviewMock(hasToken)` to decide whether to
 * render mock data when no real auth token is available.
 */

import { DEV_MODE } from '@/config/devMode';

export const isLovablePreviewHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  return host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com');
};

export const isInIframeSafe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * Strict preview detection — used to decide whether to skip auth gating.
 * Only true when we're confident no real user could be signing in:
 *   - DEV_MODE flag, OR
 *   - rendered inside an iframe (Lovable editor sandbox).
 *
 * Note: `*.lovable.app` alone is NOT enough — published apps live there
 * and have real users with real Auth0 sessions.
 */
export const isPreviewContext = (): boolean => {
  if (DEV_MODE) return true;
  if (typeof window === 'undefined') return false;
  return isInIframeSafe();
};

/**
 * Looser preview detection — used by data components to fall back to mock
 * data when both: (a) no auth token is available AND (b) the host suggests
 * a Lovable preview environment. Safe even on `*.lovable.app` because the
 * `hasToken` guard ensures real signed-in users still see real data.
 */
export const isLovablePreviewEnv = (): boolean => {
  if (DEV_MODE) return true;
  if (typeof window === 'undefined') return false;
  return isInIframeSafe() || isLovablePreviewHost();
};

/**
 * Decide whether to fall back to mock data:
 *   - We don't have a real auth token, AND
 *   - We're inside a preview context (iframe / lovable.app / DEV_MODE).
 */
export const shouldUsePreviewMock = (hasToken: boolean): boolean => {
  if (hasToken) return false;
  return isLovablePreviewEnv();
};