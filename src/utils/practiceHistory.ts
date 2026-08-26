import { trackSanctuaryEvent } from './sanctuaryEventTracking';

type PracticeContentType = 'soundbath' | 'guided-practice' | 'micro-practice';
type SanctuaryCategory = 'pause' | 'power-up' | 'presence';

interface PracticeHistoryCompletionInput {
  contentId: string;
  contentType: PracticeContentType;
  category?: string | null;
  tags?: string[];
  durationSeconds?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  partOfRitual?: boolean;
  title?: string | null;
  metadata?: Record<string, unknown>;
}

const normaliseCategory = (category?: string | null): SanctuaryCategory => {
  if (category === 'pause' || category === 'power-up' || category === 'presence') return category;
  return 'presence';
};

const currentContext = () => {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour >= 5 && hour < 12
    ? 'morning'
    : hour >= 12 && hour < 17
      ? 'afternoon'
      : hour >= 17 && hour < 21
        ? 'evening'
        : 'night';

  return {
    timeOfDay,
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
  };
};

/**
 * Writes the canonical post-completion history event. The backend records both
 * sanctuary_events and practice_sessions and returns the practice session id.
 */
export async function logPracticeHistoryCompletion({
  contentId,
  contentType,
  category,
  tags = [],
  durationSeconds,
  startedAt,
  completedAt,
  partOfRitual = false,
  title,
  metadata = {},
}: PracticeHistoryCompletionInput): Promise<string | undefined> {
  const completedAtIso = completedAt || new Date().toISOString();
  const result = await trackSanctuaryEvent({
    eventType: 'session_complete',
    contentId,
    contentType,
    category: normaliseCategory(category),
    tags,
    duration: typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds : undefined,
    timestamp: completedAtIso,
    contextData: currentContext(),
    partOfRitual,
    practiceStartedAt: startedAt || undefined,
    practiceCompletedAt: completedAtIso,
    metadata: {
      ...metadata,
      title: title ?? metadata.title,
      practice_started_at: startedAt ?? null,
      practice_completed_at: completedAtIso,
    },
  });

  const payload = result?.data as { practiceSessionId?: unknown } | undefined;
  return typeof payload?.practiceSessionId === 'string' ? payload.practiceSessionId : undefined;
}