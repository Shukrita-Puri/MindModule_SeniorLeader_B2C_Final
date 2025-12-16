import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ArchetypeInfo {
  id: string;
  name: string;
  badgeColor: string;
  thresholdPoints: number;
}

interface UnifiedProgress {
  selfMasteryPoints: number;
  socialMasteryPoints: number;
  currentSelfArchetype: ArchetypeInfo | null;
  nextSelfArchetype: ArchetypeInfo | null;
  pointsToNextSelf: number;
  currentSocialArchetype: ArchetypeInfo | null;
  nextSocialArchetype: ArchetypeInfo | null;
  pointsToNextSocial: number;
  selfBadgesEarned: number;
  socialBadgesEarned: number;
  totalSelfBadges: number;
  totalSocialBadges: number;
}

// Badge progression for each cluster
export const SELF_MASTERY_PROGRESSION: ArchetypeInfo[] = [
  { id: 'awareness-initiate', name: 'Awareness Initiate', badgeColor: '#F59E0B', thresholdPoints: 25 },
  { id: 'emotional-navigator', name: 'Emotional Navigator', badgeColor: '#EAB308', thresholdPoints: 60 },
  { id: 'regulation-adept', name: 'Regulation Adept', badgeColor: '#EA580C', thresholdPoints: 150 },
  { id: 'self-mastery-badge', name: 'Self Mastery Badge', badgeColor: '#D97706', thresholdPoints: 300 },
  { id: 'self-mastery-certificate', name: 'Self Mastery Certificate', badgeColor: '#B45309', thresholdPoints: 500 },
];

export const SOCIAL_MASTERY_PROGRESSION: ArchetypeInfo[] = [
  { id: 'connection-initiate', name: 'Connection Initiate', badgeColor: '#A78BFA', thresholdPoints: 25 },
  { id: 'empathy-practitioner', name: 'Empathy Practitioner', badgeColor: '#F472B6', thresholdPoints: 60 },
  { id: 'influence-adept', name: 'Influence Adept', badgeColor: '#C084FC', thresholdPoints: 150 },
  { id: 'social-mastery-badge', name: 'Social Mastery Badge', badgeColor: '#8B5CF6', thresholdPoints: 300 },
  { id: 'social-mastery-certificate', name: 'Social Mastery Certificate', badgeColor: '#7C3AED', thresholdPoints: 500 },
];

export const useUnifiedProgress = () => {
  const { user } = useAuth();

  const { data: progress, isLoading, refetch } = useQuery({
    queryKey: ['unified-progress', user?.id],
    queryFn: async (): Promise<UnifiedProgress> => {
      if (!user?.id) {
        return getDefaultProgress();
      }

      // Calculate Self Mastery points from multiple sources
      let selfMasteryPoints = 0;
      let socialMasteryPoints = 0;

      // 1. Daily Ritual Completions (Self Mastery only): full=5, partial=2
      const { data: rituals } = await supabase
        .from('daily_ritual_completions')
        .select('completion_status')
        .eq('user_id', user.id);

      if (rituals) {
        rituals.forEach(r => {
          if (r.completion_status === 'full') selfMasteryPoints += 5;
          else if (r.completion_status === 'partial') selfMasteryPoints += 2;
        });
      }

      // 2. Recalibrate Practice Sessions (Self Mastery only): +3 each
      const { data: practices } = await supabase
        .from('practice_sessions')
        .select('id, completed')
        .eq('user_id', user.id)
        .eq('completed', true);

      if (practices) {
        selfMasteryPoints += practices.length * 3;
      }

      // 3. Dialogue Sessions - needs to check cluster from scenario
      const { data: dialogueSessions } = await supabase
        .from('dialogue_sessions')
        .select(`
          id,
          scenario_id,
          scenario_definitions (
            category
          )
        `)
        .eq('user_id', user.id)
        .eq('session_status', 'completed');

      // 4. Detected signals for strengths/gaps
      const sessionIds = dialogueSessions?.map(s => s.id) || [];
      
      if (sessionIds.length > 0) {
        const { data: signals } = await supabase
          .from('detected_signals')
          .select('skill_strengths, skill_gaps, session_id')
          .in('session_id', sessionIds);

        dialogueSessions?.forEach(session => {
          const category = (session.scenario_definitions as any)?.category;
          const isSelfMastery = category === 'academic_confidence' || category === 'growth_opportunity';
          const isSocialMastery = category === 'social_navigation';

          // Base points per session
          if (isSelfMastery) selfMasteryPoints += 10;
          if (isSocialMastery) socialMasteryPoints += 10;

          // Find signals for this session
          const sessionSignals = signals?.filter(s => s.session_id === session.id) || [];
          sessionSignals.forEach(signal => {
            const strengthsCount = Array.isArray(signal.skill_strengths) ? signal.skill_strengths.length : 0;
            const gapsCount = Array.isArray(signal.skill_gaps) ? signal.skill_gaps.length : 0;

            if (isSelfMastery) {
              selfMasteryPoints += strengthsCount * 2;
              selfMasteryPoints -= gapsCount;
            }
            if (isSocialMastery) {
              socialMasteryPoints += strengthsCount * 2;
              socialMasteryPoints -= gapsCount;
            }
          });
        });
      }

      // Ensure points don't go negative
      selfMasteryPoints = Math.max(0, selfMasteryPoints);
      socialMasteryPoints = Math.max(0, socialMasteryPoints);

      // Determine current and next archetypes
      const selfArchetypes = calculateArchetypeProgress(selfMasteryPoints, SELF_MASTERY_PROGRESSION);
      const socialArchetypes = calculateArchetypeProgress(socialMasteryPoints, SOCIAL_MASTERY_PROGRESSION);

      // Count earned badges
      const selfBadgesEarned = SELF_MASTERY_PROGRESSION.filter(a => selfMasteryPoints >= a.thresholdPoints).length;
      const socialBadgesEarned = SOCIAL_MASTERY_PROGRESSION.filter(a => socialMasteryPoints >= a.thresholdPoints).length;

      return {
        selfMasteryPoints,
        socialMasteryPoints,
        currentSelfArchetype: selfArchetypes.current,
        nextSelfArchetype: selfArchetypes.next,
        pointsToNextSelf: selfArchetypes.pointsToNext,
        currentSocialArchetype: socialArchetypes.current,
        nextSocialArchetype: socialArchetypes.next,
        pointsToNextSocial: socialArchetypes.pointsToNext,
        selfBadgesEarned,
        socialBadgesEarned,
        totalSelfBadges: SELF_MASTERY_PROGRESSION.length,
        totalSocialBadges: SOCIAL_MASTERY_PROGRESSION.length,
      };
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  return {
    progress: progress || getDefaultProgress(),
    isLoading,
    refetch,
    SELF_MASTERY_PROGRESSION,
    SOCIAL_MASTERY_PROGRESSION,
  };
};

function calculateArchetypeProgress(points: number, progression: ArchetypeInfo[]) {
  let current: ArchetypeInfo | null = null;
  let next: ArchetypeInfo | null = null;
  let pointsToNext = 0;

  for (let i = 0; i < progression.length; i++) {
    if (points >= progression[i].thresholdPoints) {
      current = progression[i];
    } else {
      next = progression[i];
      pointsToNext = progression[i].thresholdPoints - points;
      break;
    }
  }

  // If all badges earned
  if (!next && current) {
    pointsToNext = 0;
  }

  // If no badges earned yet
  if (!current && progression.length > 0) {
    next = progression[0];
    pointsToNext = progression[0].thresholdPoints - points;
  }

  return { current, next, pointsToNext };
}

function getDefaultProgress(): UnifiedProgress {
  return {
    selfMasteryPoints: 0,
    socialMasteryPoints: 0,
    currentSelfArchetype: null,
    nextSelfArchetype: SELF_MASTERY_PROGRESSION[0],
    pointsToNextSelf: SELF_MASTERY_PROGRESSION[0].thresholdPoints,
    currentSocialArchetype: null,
    nextSocialArchetype: SOCIAL_MASTERY_PROGRESSION[0],
    pointsToNextSocial: SOCIAL_MASTERY_PROGRESSION[0].thresholdPoints,
    selfBadgesEarned: 0,
    socialBadgesEarned: 0,
    totalSelfBadges: SELF_MASTERY_PROGRESSION.length,
    totalSocialBadges: SOCIAL_MASTERY_PROGRESSION.length,
  };
}
