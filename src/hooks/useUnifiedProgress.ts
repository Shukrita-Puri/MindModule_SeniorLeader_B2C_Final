import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { getRituals } from '@/utils/dailyRituals';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

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

// Badge progression for each cluster (250pt system - synced with achievement_definitions DB)
export const SELF_MASTERY_PROGRESSION: ArchetypeInfo[] = [
  { id: 'self_mastery_initiate', name: 'Awareness Initiate', badgeColor: '#F59E0B', thresholdPoints: 25 },
  { id: 'self_mastery_practitioner', name: 'Emotional Navigator', badgeColor: '#EAB308', thresholdPoints: 50 },
  { id: 'self_mastery_adept', name: 'Regulation Adept', badgeColor: '#EA580C', thresholdPoints: 100 },
  { id: 'self_mastery_badge', name: 'Self Mastery Badge', badgeColor: '#D97706', thresholdPoints: 150 },
  { id: 'self_mastery_certificate', name: 'Self Mastery Certificate', badgeColor: '#B45309', thresholdPoints: 250 },
];

export const SOCIAL_MASTERY_PROGRESSION: ArchetypeInfo[] = [
  { id: 'social_mastery_initiate', name: 'Connection Initiate', badgeColor: '#A78BFA', thresholdPoints: 25 },
  { id: 'social_mastery_practitioner', name: 'Empathy Practitioner', badgeColor: '#F472B6', thresholdPoints: 50 },
  { id: 'social_mastery_adept', name: 'Influence Adept', badgeColor: '#C084FC', thresholdPoints: 100 },
  { id: 'social_mastery_badge', name: 'Social Mastery Badge', badgeColor: '#8B5CF6', thresholdPoints: 150 },
  { id: 'social_mastery_certificate', name: 'Social Mastery Certificate', badgeColor: '#7C3AED', thresholdPoints: 250 },
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

      // 1. Daily Ritual Completions (Self Mastery only): full=5, partial=2 - via edge function
      const rituals = await getRituals(365);

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

      // 3. Dialogue Sessions - direct query in DEV_MODE, edge function in production
      try {
        let dialogueSessions: any[] = [];
        let signals: any[] = [];

        if (DEV_MODE) {
          // DEV_MODE: Direct database query
          const { data: sessionsData } = await supabase
            .from('dialogue_sessions')
            .select('id, scenario_id, scenario_definitions(category)')
            .eq('user_id', DEV_USER.id);
          
          dialogueSessions = sessionsData || [];
          
          if (dialogueSessions.length > 0) {
            const sessionIds = dialogueSessions.map(s => s.id);
            const { data: signalsData } = await supabase
              .from('detected_signals')
              .select('session_id, skill_strengths, skill_gaps')
              .in('session_id', sessionIds);
            signals = signalsData || [];
          }
        } else {
          // Production: Use edge function with Auth0 token
          const accessToken = await getAuthToken();
          const { data: progressData, error: progressError } = await supabase.functions.invoke('dialogue-progress-data', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {}
          });

          if (!progressError && progressData?.success) {
            dialogueSessions = progressData.dialogueSessions || [];
            signals = progressData.signals || [];
          }
        }

        dialogueSessions.forEach((session: any) => {
          const category = session.scenario_definitions?.category;
          // growth_opportunity contributes to BOTH clusters
          const isSelfMastery = category === 'academic_confidence' || category === 'growth_opportunity';
          const isSocialMastery = category === 'social_navigation' || category === 'growth_opportunity';

          // Base points per session
          if (isSelfMastery) selfMasteryPoints += 10;
          if (isSocialMastery) socialMasteryPoints += 10;

          // Find signals for this session
          const sessionSignals = signals.filter((s: any) => s.session_id === session.id);
          sessionSignals.forEach((signal: any) => {
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
      } catch (err) {
        console.error('[useUnifiedProgress] Error fetching dialogue data:', err);
        // Continue with other data sources
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

  // Sync earned badges to database via edge function
  const hasSynced = useRef(false);
  
  useEffect(() => {
    const syncEarnedBadges = async () => {
      if (!user?.id || !progress || hasSynced.current) return;
      
      // Get all earned badge IDs based on current points
      const earnedSelfBadges = SELF_MASTERY_PROGRESSION
        .filter(b => progress.selfMasteryPoints >= b.thresholdPoints)
        .map(b => b.id);
      
      const earnedSocialBadges = SOCIAL_MASTERY_PROGRESSION
        .filter(b => progress.socialMasteryPoints >= b.thresholdPoints)
        .map(b => b.id);
      
      const allEarnedBadgeIds = [...earnedSelfBadges, ...earnedSocialBadges];
      
      if (allEarnedBadgeIds.length === 0) return;
      
      try {
        const accessToken = await getAuthToken();
        
        // Sync achievements via edge function
        const { data, error } = await supabase.functions.invoke('user-progress', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'SYNC_ACHIEVEMENTS',
            achievementIds: allEarnedBadgeIds,
            pointsAtEarn: Math.max(progress.selfMasteryPoints, progress.socialMasteryPoints)
          }
        });
        
        if (error) {
          console.error('[useUnifiedProgress] Error syncing badges:', error);
          return;
        }
        
        if (data?.success && data?.data?.synced > 0) {
          console.log('✅ Synced badges to database:', data.data.achievementIds);
        }
        
        hasSynced.current = true;
      } catch (err) {
        console.error('[useUnifiedProgress] Error syncing badges:', err);
      }
    };
    
    syncEarnedBadges();
  }, [user?.id, progress]);

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
