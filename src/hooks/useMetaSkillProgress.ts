import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';

interface MetaSkillProgress {
  id: string;
  meta_skill_key: string;
  cluster: string;
  baseline_score: number | null;
  current_score: number;
  scenarios_practiced: number;
  strengths_demonstrated: number;
  gaps_identified: number;
}

interface ClusterProgress {
  cluster: string;
  displayName: string;
  baselineScore: number;
  currentScore: number;
  change: number;
  scenariosPracticed: number;
  skills: MetaSkillProgress[];
}

export const useMetaSkillProgress = () => {
  const { user, isAuthenticated } = useAuth();
  const [selfMastery, setSelfMastery] = useState<ClusterProgress | null>(null);
  const [socialMastery, setSocialMastery] = useState<ClusterProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      const { data, error: fetchError } = await supabase
        .from('meta_skill_progress')
        .select('*')
        .eq('user_id', user.id);

      if (fetchError) throw fetchError;

      const skills = (data || []) as MetaSkillProgress[];
      
      const selfMasterySkills = skills.filter(s => s.cluster === 'self_mastery');
      const socialMasterySkills = skills.filter(s => s.cluster === 'social_mastery');

      const calculateCluster = (clusterSkills: MetaSkillProgress[], name: string, displayName: string): ClusterProgress => {
        if (clusterSkills.length === 0) {
          return { cluster: name, displayName, baselineScore: 0, currentScore: 0, change: 0, scenariosPracticed: 0, skills: [] };
        }
        const totalBaseline = clusterSkills.reduce((sum, s) => sum + (s.baseline_score || 0), 0);
        const totalCurrent = clusterSkills.reduce((sum, s) => sum + s.current_score, 0);
        const avgBaseline = totalBaseline / clusterSkills.length;
        const avgCurrent = totalCurrent / clusterSkills.length;
        const totalScenarios = clusterSkills.reduce((sum, s) => sum + s.scenarios_practiced, 0);
        return { cluster: name, displayName, baselineScore: Math.round(avgBaseline), currentScore: Math.round(avgCurrent), change: Math.round(avgCurrent - avgBaseline), scenariosPracticed: totalScenarios, skills: clusterSkills };
      };

      setSelfMastery(calculateCluster(selfMasterySkills, 'self_mastery', 'Self Mastery'));
      setSocialMastery(calculateCluster(socialMasterySkills, 'social_mastery', 'Social Mastery'));
    } catch (err) {
      console.error('Error fetching meta skill progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to load progress');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  const initializeFromBaseline = useCallback(async (componentScores: Record<string, number>) => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const initialProgress = [
        { meta_skill_key: 'emotional_regulation', cluster: 'self_mastery', baseline_score: componentScores.energy_regulation || 50 },
        { meta_skill_key: 'self_awareness', cluster: 'self_mastery', baseline_score: componentScores.energy_regulation || 50 },
        { meta_skill_key: 'mindfulness', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'self_compassion', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'focus', cluster: 'self_mastery', baseline_score: componentScores.focus_recovery || 50 },
        { meta_skill_key: 'discipline', cluster: 'self_mastery', baseline_score: componentScores.energy_renewal || 50 },
        { meta_skill_key: 'goal_setting', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'adaptability_to_feedback', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'reflective_thinking', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'stress_management', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'perseverance', cluster: 'self_mastery', baseline_score: 50 },
        { meta_skill_key: 'empathy', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'perspective_taking', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'active_listening', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'trust_building', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'communication', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'influence', cluster: 'social_mastery', baseline_score: 50 },
        { meta_skill_key: 'collaboration', cluster: 'social_mastery', baseline_score: 50 },
      ];
      for (const skill of initialProgress) {
        await supabase.from('meta_skill_progress').upsert({
          user_id: user.id, meta_skill_key: skill.meta_skill_key, cluster: skill.cluster,
          baseline_score: skill.baseline_score, current_score: skill.baseline_score
        }, { onConflict: 'user_id,meta_skill_key' });
      }
      await fetchProgress();
    } catch (err) {
      console.error('Error initializing meta skill progress:', err);
    }
  }, [isAuthenticated, user?.id, fetchProgress]);

  const updateAfterSession = useCallback(async (
    sessionId: string,
    strengthsDetected: Array<{ metaSkill: string; cluster: string }>,
    gapsDetected: Array<{ metaSkill: string; cluster: string }>
  ) => {
    if (!isAuthenticated || !user?.id) return;
    try {
      const updates = new Map<string, { strengths: number; gaps: number; cluster: string }>();
      strengthsDetected.forEach(s => {
        const existing = updates.get(s.metaSkill) || { strengths: 0, gaps: 0, cluster: s.cluster };
        existing.strengths++;
        updates.set(s.metaSkill, existing);
      });
      gapsDetected.forEach(g => {
        const existing = updates.get(g.metaSkill) || { strengths: 0, gaps: 0, cluster: g.cluster };
        existing.gaps++;
        updates.set(g.metaSkill, existing);
      });
      for (const [metaSkill, counts] of updates) {
        const { data: existing } = await supabase.from('meta_skill_progress').select('*')
          .eq('user_id', user.id).eq('meta_skill_key', metaSkill).maybeSingle();
        if (existing) {
          const scoreChange = (counts.strengths * 10) - (counts.gaps * 5);
          const newScore = Math.max(0, Math.min(100, existing.current_score + scoreChange));
          await supabase.from('meta_skill_progress').update({
            current_score: newScore, scenarios_practiced: existing.scenarios_practiced + 1,
            strengths_demonstrated: existing.strengths_demonstrated + counts.strengths,
            gaps_identified: existing.gaps_identified + counts.gaps, last_session_id: sessionId
          }).eq('id', existing.id);
        } else {
          await supabase.from('meta_skill_progress').insert({
            user_id: user.id, meta_skill_key: metaSkill, cluster: counts.cluster,
            baseline_score: 50, current_score: 50 + (counts.strengths * 10) - (counts.gaps * 5),
            scenarios_practiced: 1, strengths_demonstrated: counts.strengths,
            gaps_identified: counts.gaps, last_session_id: sessionId
          });
        }
      }
      await fetchProgress();
    } catch (err) {
      console.error('Error updating meta skill progress:', err);
    }
  }, [isAuthenticated, user?.id, fetchProgress]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  return { selfMastery, socialMastery, isLoading, error, initializeFromBaseline, updateAfterSession, refresh: fetchProgress };
};
