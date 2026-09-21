import { useEffect } from 'react';
import { useAppUsageTracking } from '@/hooks/useAppUsageTracking';
import { requestPreSignupNotificationOptIn } from '@/utils/preSignupNotificationOptIn';

/**
 * Mounts the silent screen-usage tracker. Renders nothing and cannot affect
 * any feature — deleting this element from App.tsx disables tracking entirely.
 *
 * Also performs the one-per-device quiet (provisional) iOS notification opt-in
 * on first open, wherever the app opens, so an install that never reaches
 * onboarding is still reachable by the "finish setting up" reminder. Silent
 * no-op on web and after the first attempt.
 */
export function AppUsageTracker() {
  useAppUsageTracking();

  useEffect(() => {
    void requestPreSignupNotificationOptIn();
  }, []);

  return null;
}

export default AppUsageTracker;
