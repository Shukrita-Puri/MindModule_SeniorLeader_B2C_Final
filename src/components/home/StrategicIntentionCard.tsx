/**
 * StrategicIntentionCard - "What matters today?"
 * Displays ONE psychological frame for the entire day
 * Enhanced with: Why (mechanism) + Stakes + Unlock (archetype-aware)
 * Not interactive - pure framing instruction
 * Now saves daily theme to database for Insights tracking
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState, CurrentEnergyState } from '@/utils/energyStateEngine';
import { getStrategicTheme } from '@/utils/energyStateScoring';
import MetricInfoModal from './MetricInfoModal';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';

// Build data sources list based on what influenced the theme
const getThemeDataSources = (energyState: CurrentEnergyState): string => {
  const sources: string[] = [];
  
  // Check-in source
  if (energyState.checkInOutcome) sources.push('check-in');
  
  // Wearable source
  if (energyState.dataSources?.includes('wearable')) sources.push('wearable');
  
  // Calendar sources (only if they influenced theme)
  if (energyState.calendarPressure === 'high' || energyState.calendarPressure === 'medium') {
    sources.push('calendar pressure');
  }
  if (energyState.calendarLoad === 'high' || energyState.calendarLoad === 'medium') {
    sources.push('calendar load');
  }
  
  // Time of day always contributes
  sources.push('time of day');
  
  return sources.join(', ');
};

const StrategicIntentionCard = () => {
  const { user } = useAuth();
  const themeSavedRef = useRef<string | null>(null);

  const { data: energyState, isLoading } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => {
      return await computeEnergyState(user?.id);
    },
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Fetch user's archetype for personalized unlock statements
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-archetype', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_archetype')
        .eq('id', user?.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000, // 30 min cache
  });

  // Fetch recent check-ins for pattern recognition
  const { data: recentCheckIns } = useQuery({
    queryKey: ['recent-checkins-pattern', user?.id],
    queryFn: async () => {
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);
      
      const { data } = await supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', user?.id)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: false });
      
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate pattern recognition - count CONSECUTIVE days in same low-energy state
  const getConsecutivePatternInsight = (currentOutcome: string | undefined): { 
    count: number; 
    message: string; 
    recommendation: string;
  } | null => {
    if (!currentOutcome || !recentCheckIns || recentCheckIns.length < 2) return null;
    
    // Only track patterns for low-energy states
    const lowEnergyStates = ['overwhelmed', 'drained', 'scattered'];
    if (!lowEnergyStates.includes(currentOutcome)) return null;
    
    // Sort by date descending (most recent first)
    const sortedCheckIns = [...recentCheckIns].sort((a, b) => 
      new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
    );
    
    // Count consecutive days with same state
    let consecutiveCount = 0;
    for (const checkIn of sortedCheckIns) {
      if (checkIn.outcome === currentOutcome) {
        consecutiveCount++;
      } else {
        break;
      }
    }
    
    if (consecutiveCount >= 3) {
      const stateLabels: Record<string, string> = {
        overwhelmed: 'overwhelmed',
        drained: 'drained',
        scattered: 'scattered'
      };
      const label = stateLabels[currentOutcome] || currentOutcome;
      
      // Get state-specific recommendation
      const recommendations: Record<string, string> = {
        overwhelmed: 'accumulated stress that daily regulation alone may not resolve. Consider what boundary or recovery practice has been missing.',
        drained: 'a deeper energy deficit requiring restoration beyond daily practices. Your system may need extended recovery time.',
        scattered: 'persistent cognitive overload. Consider what open loops or unprocessed decisions are fragmenting your attention.'
      };
      
      return {
        count: consecutiveCount,
        message: `This is day ${consecutiveCount} you've checked in ${label}.`,
        recommendation: recommendations[currentOutcome] || 'a pattern that warrants attention.'
      };
    }
    return null;
  };

  // Save theme to database for Insights tracking (once per day)
  // IMPORTANT: This hook must be called unconditionally (before any early returns)
  useEffect(() => {
    const saveThemeToDb = async () => {
      // Guard inside effect instead of conditional hook call
      if (!user?.id || isLoading || !energyState) return;
      
      const theme = getStrategicTheme(
        energyState.energyTier,
        energyState.calendarLoad,
        energyState.calendarPressure,
        energyState.timeOfDay,
        energyState.checkInOutcome,
        userProfile?.user_archetype || undefined
      );
      
      if (!theme.phrase) return;
      
      const today = format(new Date(), 'yyyy-MM-dd');
      const themeKey = `${today}-${theme.phrase}`;
      
      // Only save once per theme per day
      if (themeSavedRef.current === themeKey) return;
      
      try {
        await supabase.from('daily_themes').upsert({
          user_id: user.id,
          theme_date: today,
          theme_phrase: theme.phrase,
          theme_driver: theme.driver || 'state',
          check_in_outcome: energyState.checkInOutcome || null,
          calendar_pressure: energyState.calendarPressure || null,
          calendar_load: energyState.calendarLoad || null,
          time_of_day: energyState.timeOfDay || null
        }, {
          onConflict: 'user_id,theme_date'
        });
        themeSavedRef.current = themeKey;
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    };
    
    saveThemeToDb();
  }, [user?.id, isLoading, energyState, userProfile?.user_archetype]);

  if (isLoading || !energyState) {
    return (
      <div className="animate-pulse p-5 md:p-6">
        <div className="h-4 bg-muted/50 rounded w-24 mb-3" />
        <div className="h-6 bg-muted/50 rounded w-48 mb-2" />
        <div className="h-4 bg-muted/50 rounded w-full" />
      </div>
    );
  }

  const theme = getStrategicTheme(
    energyState.energyTier,
    energyState.calendarLoad,
    energyState.calendarPressure,
    energyState.timeOfDay,
    energyState.checkInOutcome,
    userProfile?.user_archetype || undefined
  );

  const patternInsight = getConsecutivePatternInsight(energyState.checkInOutcome);

  // Build enhanced context with pattern insight if applicable
  const getEnhancedContext = (): string => {
    if (patternInsight) {
      // Pattern-aware context replaces standard context
      return `${patternInsight.message} Your system may be signaling ${patternInsight.recommendation}`;
    }
    return theme.context;
  };

  return (
    <div className={cn(
      "rounded-xl p-5 space-y-3 transition-all duration-300",
      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
      "border-l-2 border-l-taupe/40"
    )}>
      {/* Header - just label and info button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
          Theme for Today
        </span>
        <MetricInfoModal
          title="How Your Daily Theme is Selected"
          description="Your theme combines your current felt state (from check-in and wearable data), calendar pressure (high-stakes events), calendar load (meeting density), and time of day. It provides strategic guidance that acknowledges both how you feel internally and what your day demands externally."
        />
      </div>

      {/* Theme content with fade animation */}
      <div key={theme.phrase} className="animate-fade-in space-y-3">
        {/* Theme phrase - serif, italic for elegance */}
        <p className="text-xl md:text-2xl font-headline italic text-foreground leading-snug">
          "{theme.phrase}"
        </p>

        {/* Supporting context - pattern-aware or standard (Stakes/Why/Identity structure) */}
        <p className="text-sm text-muted-foreground leading-relaxed font-body">
          {getEnhancedContext()}
        </p>
      </div>

      {/* Footer - data sources (matching Today's State) */}
      <div className="pt-1">
        <span className="text-xs text-muted-foreground/50 font-body">
          Based on {getThemeDataSources(energyState)}
        </span>
      </div>
    </div>
  );
};

export default StrategicIntentionCard;
