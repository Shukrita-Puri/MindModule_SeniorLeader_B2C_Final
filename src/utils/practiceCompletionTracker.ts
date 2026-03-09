/**
 * Unified Practice Completion Tracker
 * 
 * Ensures all practice completions are logged to sanctuary_events for Insights page
 */

import { trackSanctuaryEvent } from './sanctuaryEventTracking';

interface PracticeCompletionParams {
  contentId: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  category: string;
  durationSeconds: number;
  tags?: string[];
  contextData?: Record<string, any>;
}

/**
 * Logs a practice completion to sanctuary_events for insights tracking
 */
export async function logPracticeCompletion({
  contentId,
  contentType,
  category,
  durationSeconds,
  tags = [],
  contextData = {}
}: PracticeCompletionParams): Promise<boolean> {
  try {
    // Auth is handled by trackSanctuaryEvent via Auth0 token — no local gate needed

    // Determine time of day for context
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Track to sanctuary_events
    await trackSanctuaryEvent({
      eventType: 'session_complete',
      contentId,
      contentType,
      category: category as 'pause' | 'power-up' | 'presence',
      tags,
      duration: durationSeconds,
      timestamp: new Date().toISOString(),
      contextData: {
        timeOfDay,
        dayOfWeek,
        ...contextData
      }
    });

    console.log('[PracticeCompletionTracker] Logged completion:', {
      contentId,
      contentType,
      category,
      durationSeconds
    });

    return true;
  } catch (error) {
    console.error('[PracticeCompletionTracker] Failed to log completion:', error);
    return false;
  }
}

/**
 * Check if practice is in an active ritual queue
 */
export function isInRitualQueue(practiceId: string): boolean {
  try {
    const queue = localStorage.getItem('practiceQueue');
    if (!queue) return false;
    const parsed = JSON.parse(queue);
    return Array.isArray(parsed) && parsed.some((p: any) => p.id === practiceId);
  } catch {
    return false;
  }
}
