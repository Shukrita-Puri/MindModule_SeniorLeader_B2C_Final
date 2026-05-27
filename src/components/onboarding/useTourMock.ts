/**
 * useTourMock — strict gate for showing best-in-class demo Brief and
 * Plan content to GENUINE first-time users during the App Tour.
 *
 * Triple-AND contract:
 *   1. Tour is mounted (sessionStorage flag set by FirstSessionGuide)
 *   2. User is a genuine first-time user (layered detection below)
 *   3. (Decided per-consumer) the real Brief / Plan has no data yet
 *
 * First-time user resolver (negative signals win):
 *   a. isRetakeForUser(uid) === true → existing user
 *   b. getTourSource() === 'retake'  → existing user
 *   c. user.onboarding_completed_at older than ~10 minutes → existing
 *   d. otherwise → first-time
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import {
  isRetakeForUser,
  getTourSource,
} from '@/utils/firstSessionTour';

export const TOUR_MOCK_KEY = 'tour_mock_active';
export const TOUR_MOCK_EVENT = 'tour-mock-changed';

export function setTourMockActive(active: boolean) {
  try {
    if (active) sessionStorage.setItem(TOUR_MOCK_KEY, '1');
    else sessionStorage.removeItem(TOUR_MOCK_KEY);
    window.dispatchEvent(new CustomEvent(TOUR_MOCK_EVENT));
  } catch {
    /* private mode */
  }
}

function readActive(): boolean {
  try {
    return sessionStorage.getItem(TOUR_MOCK_KEY) === '1';
  } catch {
    return false;
  }
}

const FRESH_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

export interface TourMockState {
  isTourMockActive: boolean;
  firstTimeUser: boolean;
  /** Convenience flag — true ⇨ this consumer should render demo data. */
  shouldRenderMock: boolean;
}

export function useTourMock(): TourMockState {
  const { user } = useAuth();
  const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : null);
  const [isActive, setIsActive] = useState<boolean>(() => readActive());

  useEffect(() => {
    const sync = () => setIsActive(readActive());
    window.addEventListener(TOUR_MOCK_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TOUR_MOCK_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const firstTimeUser = (() => {
    // (a) explicit retake binding
    if (isRetakeForUser(effectiveId)) return false;
    // (b) source flag
    if (getTourSource() === 'retake') return false;
    // (c) account age — onboarding finished more than ~10 minutes ago
    const finishedAt = user?.onboarding_completed_at;
    if (finishedAt) {
      const age = Date.now() - new Date(finishedAt).getTime();
      if (Number.isFinite(age) && age > FRESH_ACCOUNT_WINDOW_MS) return false;
    }
    return true;
  })();

  return {
    isTourMockActive: isActive,
    firstTimeUser,
    shouldRenderMock: isActive && firstTimeUser,
  };
}