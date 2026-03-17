import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getRituals } from '@/utils/dailyRituals';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

const STREAK_MILESTONES = [7, 14, 30, 60, 90];

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCelebration: number;
  shouldCelebrate: boolean;
  milestoneReached: number | null;
}

export const useStreakTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasCelebratedRef = useRef(false);

  const { data: streakData, isLoading } = useQuery({
    queryKey: ['streak-tracking', user?.id],
    queryFn: async (): Promise<StreakData> => {
      if (!user?.id) {
        return { currentStreak: 0, longestStreak: 0, lastCelebration: 0, shouldCelebrate: false, milestoneReached: null };
      }

      // Get profile for last celebration
      const { data: profile } = await supabase
        .from('profiles')
        .select('current_streak, longest_streak, last_streak_celebration')
        .eq('id', user.id)
        .maybeSingle();

      // Calculate current streak from ritual completions via edge function
      const allRituals = await getRituals(365);
      const rituals = allRituals
        .filter(r => r.completion_status === 'full')
        .sort((a, b) => new Date(b.ritual_date).getTime() - new Date(a.ritual_date).getTime());

      let currentStreak = 0;
      if (rituals && rituals.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Check if today or yesterday has a completion (allow for timezone)
        const latestDate = new Date(rituals[0].ritual_date);
        latestDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // If latest completion is more than 1 day old, streak is broken
        if (diffDays > 1) {
          currentStreak = 0;
        } else {
          // Count consecutive days
          currentStreak = 1;
          for (let i = 1; i < rituals.length; i++) {
            const prevDate = new Date(rituals[i - 1].ritual_date);
            const currDate = new Date(rituals[i].ritual_date);
            prevDate.setHours(0, 0, 0, 0);
            currDate.setHours(0, 0, 0, 0);
            
            const dayDiff = Math.floor((prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (dayDiff === 1) {
              currentStreak++;
            } else {
              break;
            }
          }
        }
      }

      const lastCelebration = profile?.last_streak_celebration || 0;
      const longestStreak = Math.max(currentStreak, profile?.longest_streak || 0);

      // Check if we should celebrate a new milestone
      let shouldCelebrate = false;
      let milestoneReached: number | null = null;

      for (const milestone of STREAK_MILESTONES) {
        if (currentStreak >= milestone && lastCelebration < milestone) {
          shouldCelebrate = true;
          milestoneReached = milestone;
          break;
        }
      }

      // Always persist current streak to profiles for backend access (smart-nudges)
      if (currentStreak !== (profile?.current_streak || 0) || longestStreak !== (profile?.longest_streak || 0)) {
        supabase
          .from('profiles')
          .update({ current_streak: currentStreak, longest_streak: longestStreak })
          .eq('id', user.id)
          .then(({ error }) => {
            if (error) console.warn('[streak] Failed to persist streak:', error);
          });
      }

      return {
        currentStreak,
        longestStreak,
        lastCelebration,
        shouldCelebrate,
        milestoneReached,
      };
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  // Mutation to update celebration status
  const celebrateMutation = useMutation({
    mutationFn: async (milestone: number) => {
      if (!user?.id) return;

      await supabase
        .from('profiles')
        .update({
          last_streak_celebration: milestone,
          current_streak: streakData?.currentStreak || 0,
          longest_streak: streakData?.longestStreak || 0,
        })
        .eq('id', user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streak-tracking', user?.id] });
    },
  });

  // Trigger celebration when milestone is reached
  useEffect(() => {
    if (streakData?.shouldCelebrate && streakData?.milestoneReached && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      
      // Fire confetti with golden/saffron colors
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#FBBF24', '#FCD34D', '#D97706', '#B45309'],
      });

      toast.success(`🔥 ${streakData.milestoneReached} Day Streak!`, {
        description: `Amazing consistency! You've completed your daily ritual for ${streakData.milestoneReached} consecutive days.`,
        duration: 5000,
      });

      // Update database to mark celebration
      celebrateMutation.mutate(streakData.milestoneReached);
    }
  }, [streakData?.shouldCelebrate, streakData?.milestoneReached]);

  // Reset celebration ref when streak data changes
  useEffect(() => {
    if (!streakData?.shouldCelebrate) {
      hasCelebratedRef.current = false;
    }
  }, [streakData?.shouldCelebrate]);

  return {
    currentStreak: streakData?.currentStreak || 0,
    longestStreak: streakData?.longestStreak || 0,
    isLoading,
    milestones: STREAK_MILESTONES,
    isOnStreak: (streakData?.currentStreak || 0) > 0,
    nextMilestone: STREAK_MILESTONES.find(m => m > (streakData?.currentStreak || 0)) || null,
    daysToMilestone: (() => {
      const next = STREAK_MILESTONES.find(m => m > (streakData?.currentStreak || 0));
      return next ? next - (streakData?.currentStreak || 0) : 0;
    })(),
  };
};
