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

export const isPreviewContext = (): boolean => {
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
  return isPreviewContext();
};