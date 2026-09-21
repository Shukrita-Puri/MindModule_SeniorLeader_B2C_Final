import { useAppUsageTracking } from '@/hooks/useAppUsageTracking';

/**
 * Mounts the silent screen-usage tracker. Renders nothing and cannot affect
 * any feature — deleting this element from App.tsx disables tracking entirely.
 */
export function AppUsageTracker() {
  useAppUsageTracking();
  return null;
}

export default AppUsageTracker;
