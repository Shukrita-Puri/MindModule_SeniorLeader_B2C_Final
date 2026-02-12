/**
 * Friction & Strength Detail Component
 * Shows archetype strength and growth area with check-in pattern data and coach insights
 */

import { useEffect, useState } from 'react';
import { Loader2, Shield, AlertTriangle, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { determineArchetype, type UserArchetype } from '@/utils/userArchetypeEngine';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface FrictionAndStrengthDetailProps {
  userId?: string;
  profileBaseline?: {
    userArchetype?: string;
    componentScores?: Record<string, number>;
  } | null;
}

interface CoachInsight {
  insight_text: string;
  created_at: string;
  source: string;
}

const FrictionAndStrengthDetail = ({ userId, profileBaseline }: FrictionAndStrengthDetailProps) => {
  const [archetype, setArchetype] = useState<UserArchetype | null>(null);
  const [frictionFrequency, setFrictionFrequency] = useState(0);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [coachStrengthInsight, setCoachStrengthInsight] = useState<string | null>(null);
  const [coachFrictionInsight, setCoachFrictionInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) fetchData();
  }, [userId, profileBaseline]);

  const fetchData = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;

    try {
      // Determine archetype from component scores
      if (profileBaseline?.componentScores) {
        const scores = profileBaseline.componentScores as any;
        const arch = determineArchetype(scores);
        setArchetype(arch);
      } else if (profileBaseline?.userArchetype) {
        // Use stored archetype name to create a minimal archetype object
        setArchetype({
          id: profileBaseline.userArchetype,
          title: profileBaseline.userArchetype.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: '',
          percentile: '',
          unlockStatement: '',
          strengthArea: 'Self-Regulation',
          growthArea: 'Energy Management',
          recommendedMastery: 'Pause'
        });
      }

      // Fetch last 30 days of check-ins to count friction patterns (low states)
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('outcome')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', thirtyDaysAgo);

      if (checkIns) {
        setTotalCheckins(checkIns.length);
        const lowStates = checkIns.filter(c => 
          ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')
        );
        setFrictionFrequency(lowStates.length);
      }

      // Fetch recent coach insights
      const { data: insights } = await supabase
        .from('user_coach_insights')
        .select('insight_content, created_at, insight_type')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (insights && insights.length > 0) {
        // Find a positive insight for strength
        const positiveKeywords = ['strength', 'strong', 'excel', 'good at', 'natural', 'talent', 'composure', 'resilient'];
        const strengthInsight = insights.find(i => 
          positiveKeywords.some(k => i.insight_content?.toLowerCase().includes(k))
        );
        if (strengthInsight) setCoachStrengthInsight(strengthInsight.insight_content);

        // Find a friction/growth insight
        const frictionKeywords = ['struggle', 'challenge', 'difficult', 'pattern', 'tends to', 'watch for', 'avoid', 'friction'];
        const frictionInsight = insights.find(i => 
          frictionKeywords.some(k => i.insight_content?.toLowerCase().includes(k))
        );
        if (frictionInsight) setCoachFrictionInsight(frictionInsight.insight_content);
      }
    } catch (error) {
      console.error('Error fetching friction/strength data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!archetype) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">Complete onboarding to see your strength & friction profile.</p>
      </div>
    );
  }

  const frictionPct = totalCheckins > 0 ? Math.round((frictionFrequency / totalCheckins) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Strength */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
        <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Lean on: {archetype.strengthArea}
          </p>
          {coachStrengthInsight ? (
            <div className="flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground italic">"{coachStrengthInsight}"</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Based on your {archetype.title} profile
            </p>
          )}
        </div>
      </div>

      {/* Friction */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Watch for: {archetype.growthArea}
          </p>
          {coachFrictionInsight ? (
            <div className="flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground italic">"{coachFrictionInsight}"</p>
            </div>
          ) : totalCheckins > 0 ? (
            <p className="text-xs text-muted-foreground">
              Low-state patterns appeared {frictionFrequency}× in last 30 days ({frictionPct}% of check-ins)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Based on your {archetype.title} profile
            </p>
          )}
        </div>
      </div>

      {/* Source note */}
      <p className="text-[10px] text-muted-foreground/60 text-center">
        Derived from your {archetype.title} archetype
        {totalCheckins > 0 && ` and ${totalCheckins} check-ins`}
      </p>
    </div>
  );
};

export default FrictionAndStrengthDetail;
