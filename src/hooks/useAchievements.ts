import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth0 } from '@auth0/auth0-react';
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
  const { user, isAuthenticated } = useAuth0();
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([]);
  const [earnedAchievements, setEarnedAchievements] = useState<UserAchievement[]>([]);
  const [certificateRequests, setCertificateRequests] = useState<CertificateRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAchievements = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch definitions (public)
      const { data: defs, error: defsError } = await supabase
        .from('achievement_definitions')
        .select('*')
        .order('display_order');

      if (defsError) throw defsError;
      setDefinitions((defs || []) as AchievementDefinition[]);

      // Fetch user's earned achievements
      if (isAuthenticated && user?.sub) {
        const { data: earned, error: earnedError } = await supabase
          .from('user_achievements')
          .select('*')
          .eq('user_id', user.sub);

        if (earnedError) throw earnedError;

        // Merge with definitions
        const earnedWithDefs = (earned || []).map(a => ({
          ...a,
          definition: (defs || []).find(d => d.id === a.achievement_id) as AchievementDefinition
        })) as UserAchievement[];

        setEarnedAchievements(earnedWithDefs);

        // Fetch certificate requests
        const { data: certs, error: certsError } = await supabase
          .from('certificate_requests')
          .select('*')
          .eq('user_id', user.sub);

        if (certsError) throw certsError;
        setCertificateRequests((certs || []) as CertificateRequest[]);
      }
    } catch (err) {
      console.error('Error fetching achievements:', err);
      setError(err instanceof Error ? err.message : 'Failed to load achievements');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.sub]);

  // Check and award achievements based on unified points
  const checkAndAwardAchievements = useCallback(async (
    cluster: 'self_mastery' | 'social_mastery',
    unifiedPoints: number,
    skillProgress?: number
  ) => {
    if (!isAuthenticated || !user?.sub) return;

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

      // Award new achievements
      for (const achievement of newAchievements) {
        const { error: insertError } = await supabase
          .from('user_achievements')
          .insert({
            user_id: user.sub,
            achievement_id: achievement.id,
            scenarios_at_earn: null, // No longer tracking scenarios
            skill_progress_at_earn: unifiedPoints // Store points instead
          });

        if (!insertError) {
          // Trigger celebratory confetti with app-themed colors
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#F59E0B', '#D97706', '#9B8B7E', '#C4A86B', '#E5B84C']
          });
          
          toast.success(`🏆 Achievement Unlocked: ${achievement.name}`, {
            description: achievement.description || undefined
          });
        }
      }

      if (newAchievements.length > 0) {
        await fetchAchievements();
      }

      return newAchievements;
    } catch (err) {
      console.error('Error checking achievements:', err);
    }
  }, [isAuthenticated, user?.sub, definitions, earnedAchievements, fetchAchievements]);

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

  // Mark achievement as shared to LinkedIn
  const markAsShared = useCallback(async (achievementId: string) => {
    if (!isAuthenticated || !user?.sub) return;

    try {
      await supabase
        .from('user_achievements')
        .update({
          shared_to_linkedin: true,
          shared_at: new Date().toISOString()
        })
        .eq('user_id', user.sub)
        .eq('achievement_id', achievementId);

      setEarnedAchievements(prev => prev.map(a => 
        a.achievement_id === achievementId 
          ? { ...a, shared_to_linkedin: true, shared_at: new Date().toISOString() }
          : a
      ));
    } catch (err) {
      console.error('Error marking as shared:', err);
    }
  }, [isAuthenticated, user?.sub]);

  // Request physical certificate
  const requestCertificate = useCallback(async (params: {
    achievementId: string;
    fullName: string;
    email: string;
    mailingAddress: string;
    city?: string;
    country?: string;
    postalCode?: string;
  }) => {
    if (!isAuthenticated || !user?.sub) {
      throw new Error('Must be authenticated to request certificate');
    }

    try {
      const { data, error: insertError } = await supabase
        .from('certificate_requests')
        .insert({
          user_id: user.sub,
          achievement_id: params.achievementId,
          full_name: params.fullName,
          email: params.email,
          mailing_address: params.mailingAddress,
          city: params.city,
          country: params.country,
          postal_code: params.postalCode
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('Certificate request submitted!', {
        description: 'We\'ll process your request and ship your certificate soon.'
      });

      await fetchAchievements();
      return data;
    } catch (err) {
      console.error('Error requesting certificate:', err);
      throw err;
    }
  }, [isAuthenticated, user?.sub, fetchAchievements]);

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
    checkAndAwardAchievementsLegacy, // For backward compatibility
    markAsShared,
    requestCertificate,
    getCurrentArchetype,
    isEligibleForCertificate,
    hasCertificateRequest,
    refresh: fetchAchievements
  };
};
