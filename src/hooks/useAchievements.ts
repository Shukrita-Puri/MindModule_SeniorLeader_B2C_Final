import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface AchievementDefinition {
  id: string;
  name: string;
  description: string | null;
  category: 'archetype' | 'mastery' | 'certificate';
  cluster: 'self_mastery' | 'social_mastery' | null;
  badge_color: string | null;
  threshold_scenarios: number;
  threshold_points: number | null;
  threshold_skill_progress: number | null;
  display_order: number;
}

interface UserAchievement {
  id: string;
  achievement_id: string;
  earned_at: string;
  scenarios_at_earn: number | null;
  skill_progress_at_earn: number | null;
  shared_to_linkedin: boolean;
  shared_at: string | null;
  definition?: AchievementDefinition;
}

interface CertificateRequest {
  id: string;
  achievement_id: string;
  full_name: string;
  email: string;
  mailing_address: string;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  request_status: string;
  requested_at: string;
}

export const useAchievements = () => {
  const { user, isAuthenticated } = useAuth();
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [earnedAchievements, setEarnedAchievements] = useState<UserAchievement[]>([]);
  const [certificateRequests, setCertificateRequests] = useState<CertificateRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAchievements = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch definitions (public - no auth required)
      const { data: defs, error: defsError } = await supabase
        .from('achievement_definitions')
        .select('*')
        .order('display_order');

      if (defsError) throw defsError;
      setDefinitions((defs || []) as AchievementDefinition[]);

      // Fetch user's earned achievements and certificate requests via edge function
      if (isAuthenticated && user?.id) {
        try {
          const accessToken = await getAuthToken();
          
          // Fetch achievements via edge function
          const { data: achievementsResult, error: achievementsError } = await supabase.functions.invoke('user-progress', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { action: 'GET_ACHIEVEMENTS' }
          });

          if (achievementsError) {
            console.error('[useAchievements] Error fetching achievements:', achievementsError);
          } else if (achievementsResult?.success) {
            const earned = achievementsResult.data || [];
            // Merge with definitions
            const earnedWithDefs = earned.map((a: any) => ({
              ...a,
              definition: (defs || []).find(d => d.id === a.achievement_id) as AchievementDefinition
            })) as UserAchievement[];
            setEarnedAchievements(earnedWithDefs);
          }

          // Fetch certificate requests via edge function
          const { data: certsResult, error: certsError } = await supabase.functions.invoke('user-progress', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { action: 'GET_CERTIFICATE_REQUESTS' }
          });

          if (certsError) {
            console.error('[useAchievements] Error fetching certificate requests:', certsError);
          } else if (certsResult?.success) {
            setCertificateRequests((certsResult.data || []) as CertificateRequest[]);
          }
        } catch (tokenError) {
          console.error('[useAchievements] Error getting access token:', tokenError);
        }
      }
    } catch (err) {
      console.error('Error fetching achievements:', err);
      setError(err instanceof Error ? err.message : 'Failed to load achievements');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  // Check and award achievements based on unified points
  const checkAndAwardAchievements = useCallback(async (
    cluster: 'self_mastery' | 'social_mastery',
    unifiedPoints: number,
    skillProgress?: number
  ) => {
    if (!isAuthenticated || !user?.id) return;

    try {
      // Find eligible achievements for this cluster using threshold_points
      const eligibleDefs = definitions.filter(d => 
        d.cluster === cluster &&
        d.threshold_points !== null &&
        unifiedPoints >= d.threshold_points &&
        (!d.threshold_skill_progress || (skillProgress && skillProgress >= d.threshold_skill_progress))
      );

      // Check which ones user doesn't have yet
      const earnedIds = new Set(earnedAchievements.map(a => a.achievement_id));
      const newAchievements = eligibleDefs.filter(d => !earnedIds.has(d.id));

      // Award new achievements via edge function
      if (newAchievements.length > 0) {
        try {
          const accessToken = await getAuthToken();
          const { data, error: syncError } = await supabase.functions.invoke('user-progress', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {
              action: 'SYNC_ACHIEVEMENTS',
              achievementIds: newAchievements.map(a => a.id),
              pointsAtEarn: unifiedPoints
            }
          });

          if (syncError) {
            console.error('[useAchievements] Error syncing achievements:', syncError);
          } else if (data?.success) {
            // Trigger celebratory confetti for each new achievement
            newAchievements.forEach(achievement => {
              confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#F59E0B', '#D97706', '#9B8B7E', '#C4A86B', '#E5B84C']
              });
              
              toast.success(`🏆 Achievement Unlocked: ${achievement.name}`, {
                description: achievement.description || undefined
              });
            });
          }
        } catch (tokenError) {
          console.error('[useAchievements] Error getting access token:', tokenError);
        }
      }

      if (newAchievements.length > 0) {
        await fetchAchievements();
      }

      return newAchievements;
    } catch (err) {
      console.error('Error checking achievements:', err);
    }
  }, [isAuthenticated, user?.id, definitions, earnedAchievements, fetchAchievements]);

  // Legacy method for backward compatibility
  const checkAndAwardAchievementsLegacy = useCallback(async (
    cluster: 'self_mastery' | 'social_mastery',
    scenariosPracticed: number,
    skillProgress: number
  ) => {
    // Convert scenarios to approximate points (10 per scenario)
    const approximatePoints = scenariosPracticed * 10;
    return checkAndAwardAchievements(cluster, approximatePoints, skillProgress);
  }, [checkAndAwardAchievements]);

  // Mark achievement as shared to LinkedIn via edge function
  const markAsShared = useCallback(async (achievementId: string) => {
    if (!isAuthenticated || !user?.id) return;

    try {
      const accessToken = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('user-progress', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'MARK_SHARED',
          achievementId
        }
      });

      if (error) {
        console.error('[useAchievements] Error marking as shared:', error);
        return;
      }

      if (data?.success) {
        setEarnedAchievements(prev => prev.map(a => 
          a.achievement_id === achievementId 
            ? { ...a, shared_to_linkedin: true, shared_at: new Date().toISOString() }
            : a
        ));
      }
    } catch (err) {
      console.error('Error marking as shared:', err);
    }
  }, [isAuthenticated, user?.id]);

  // Request physical certificate (via secure edge function with encrypted storage)
  const requestCertificate = useCallback(async (params: {
    achievementId: string;
    fullName: string;
    email: string;
    mailingAddress: string;
    city?: string;
    country?: string;
    postalCode?: string;
  }) => {
    if (!isAuthenticated || !user?.id) {
      throw new Error('Must be authenticated to request certificate');
    }

    try {
      const accessToken = await getAuthToken();

      const { data, error } = await supabase.functions.invoke('certificate-request-create', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: {
          achievementId: params.achievementId,
          fullName: params.fullName,
          email: params.email,
          mailingAddress: params.mailingAddress,
          city: params.city,
          country: params.country,
          postalCode: params.postalCode
        }
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create certificate request');

      toast.success('Certificate request submitted!', {
        description: 'We\'ll process your request and ship your certificate soon.'
      });

      await fetchAchievements();
      return data.data;
    } catch (err) {
      console.error('Error requesting certificate:', err);
      throw err;
    }
  }, [isAuthenticated, user?.id, fetchAchievements]);

  // Get current archetype for a cluster
  const getCurrentArchetype = useCallback((cluster: 'self_mastery' | 'social_mastery') => {
    const clusterAchievements = earnedAchievements
      .filter(a => a.definition?.cluster === cluster && a.definition?.category === 'archetype')
      .sort((a, b) => (b.definition?.display_order || 0) - (a.definition?.display_order || 0));
    
    return clusterAchievements[0]?.definition || null;
  }, [earnedAchievements]);

  // Check if user is eligible for certificate
  const isEligibleForCertificate = useCallback((cluster: 'self_mastery' | 'social_mastery') => {
    const certDef = definitions.find(d => 
      d.cluster === cluster && d.category === 'certificate'
    );
    return earnedAchievements.some(a => a.achievement_id === certDef?.id);
  }, [definitions, earnedAchievements]);

  // Check if certificate already requested
  const hasCertificateRequest = useCallback((achievementId: string) => {
    return certificateRequests.some(r => r.achievement_id === achievementId);
  }, [certificateRequests]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  return {
    definitions,
    earnedAchievements,
    certificateRequests,
    isLoading,
    error,
    checkAndAwardAchievements,
    checkAndAwardAchievementsLegacy,
    markAsShared,
    requestCertificate,
    getCurrentArchetype,
    isEligibleForCertificate,
    hasCertificateRequest,
    refresh: fetchAchievements
  };
};
