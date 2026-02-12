import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import WeeklyRitualStreak from '@/components/home/WeeklyRitualStreak';
import InnerWorldBubbles from '@/components/insights/InnerWorldBubbles';
import PsychologicalDimensionBubbles from '@/components/insights/PsychologicalDimensionBubbles';
import EnergyRhythm from '@/components/insights/EnergyRhythm';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import CalendarStateCorrelations from '@/components/insights/CalendarStateCorrelations';
import BehaviorOutcomeCorrelations from '@/components/insights/BehaviorOutcomeCorrelations';
import BaselineReferenceCard from '@/components/insights/BaselineReferenceCard';
import ProgressiveUnlockMessage from '@/components/insights/ProgressiveUnlockMessage';
import LuxuryProgressRing from '@/components/insights/LuxuryProgressRing';
import LuxuryStateBar from '@/components/insights/LuxuryStateBar';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import { extractDimensionsFromText, extractThemesFromContent } from '@/utils/dimensionExtraction';

interface DayData {
  date: string;
  dayLabel: string;
  energyBalance: number | null;
  outcome: string | null;
  checkInCompleted: boolean;
}

interface PracticeData {
  category: string;
  count: number;
  totalDuration: number;
}

interface TinyWinsInsights {
  themes: string[];
  dimensions?: { dimension: string; value: string; count: number }[];
  summary: string | null;
  winsCount: number;
}

interface StatePatternInsights {
  distribution: Record<string, number>;
  observation: string | null;
  checkInCount: number;
}

interface SemanticAnalysis {
  themePatterns: { phrase: string; count: number; driver: string }[];
  unifiedThemes: {
    theme: string;
    totalCount: number;
    weight: number;
    sources: { coach: number; practice: number; wins: number; checkins: number };
  }[];
  themeRelationships: { from: string; to: string; strength: number }[];
}

interface BubbleDetails {
  keyword: string;
  totalCount: number;
  recentMentions: {
    snippet: string;
    date: string;
    source: 'coach' | 'practice' | 'wins' | 'checkins';
    sessionId?: string;
  }[];
}

interface CheckInWithTimestamp {
  date: string;
  outcome: string | null;
  timestamp: string;
}

interface ProfileBaseline {
  mentalFitnessBaseline?: number;
  componentScores?: Record<string, number>;
  userArchetype?: string;
  onboardingCompletedAt?: string;
  growthPriority?: string;
}

// State colors for the bar chart
const stateColors: Record<string, string> = {
  focused: 'hsl(142 76% 36%)',
  steady: 'hsl(217 91% 60%)',
  scattered: 'hsl(38 92% 50%)',
  drained: 'hsl(0 0% 62%)',
  overwhelmed: 'hsl(0 84% 60%)'
};

// State display names
const stateLabels: Record<string, string> = {
  focused: 'Focused',
  steady: 'Steady',
  scattered: 'Scattered',
  drained: 'Drained',
  overwhelmed: 'Overwhelmed'
};

// Insights tier based on check-in count
type InsightsTier = 'baseline' | 'early' | 'summary' | 'deepening' | 'full';

const Insights = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [practiceData, setPracticeData] = useState<PracticeData[]>([]);
  const [checkInStreak, setCheckInStreak] = useState(0);
  const [checkInsWithTimestamp, setCheckInsWithTimestamp] = useState<CheckInWithTimestamp[]>([]);
  const [tinyWinsInsights, setTinyWinsInsights] = useState<TinyWinsInsights | null>(null);
  const [tinyWinsContent, setTinyWinsContent] = useState<Array<{ content: string; date: string }>>([]);
  const [winsLoading, setWinsLoading] = useState(false);
  const [statePatterns, setStatePatterns] = useState<StatePatternInsights | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [semanticAnalysis, setSemanticAnalysis] = useState<SemanticAnalysis | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [profileBaseline, setProfileBaseline] = useState<ProfileBaseline | null>(null);

  // Calculate check-in count from state patterns
  const checkInCount = statePatterns?.checkInCount || 0;

  // Determine insights tier
  const insightsTier: InsightsTier = useMemo(() => {
    if (checkInCount >= 7) return 'full';
    if (checkInCount >= 4) return 'deepening';
    if (checkInCount >= 3) return 'summary';
    if (checkInCount >= 1) return 'early';
    return 'baseline';
  }, [checkInCount]);

  // Calculate most common state this week
  const mostCommonState = useMemo(() => {
    if (!statePatterns?.distribution) return null;
    const entries = Object.entries(statePatterns.distribution);
    if (entries.length === 0) return null;
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0][1] > 0 ? sorted[0][0] : null;
  }, [statePatterns]);

  // Get yesterday's state for comparison
  const todayAndYesterdayStates = useMemo(() => {
    if (checkInsWithTimestamp.length < 2) return null;
    const sorted = [...checkInsWithTimestamp].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return {
      today: sorted[0]?.outcome,
      yesterday: sorted[1]?.outcome
    };
  }, [checkInsWithTimestamp]);

  // Mind Map readiness check
  const mindMapReady = useMemo(() => {
    const coachSessions = semanticAnalysis?.unifiedThemes?.reduce((sum, t) => sum + t.sources.coach, 0) || 0;
    const totalPoints = checkInCount + (tinyWinsInsights?.winsCount || 0) + coachSessions;
    return coachSessions >= 3 || (checkInCount >= 5 && (tinyWinsInsights?.winsCount || 0) >= 2) || totalPoints >= 5;
  }, [semanticAnalysis, checkInCount, tinyWinsInsights]);

  useEffect(() => {
    if (user?.id) {
      fetchInsightsData();
      fetchTinyWinsInsights();
      fetchStatePatterns();
      fetchSemanticAnalysis();
      fetchProfileBaseline();
    }
  }, [user?.id]);

  const fetchProfileBaseline = async () => {
    if (!user?.id) return;
    try {
      // Use DEV_USER.id in DEV_MODE
      const effectiveUserId = DEV_MODE ? DEV_USER.id : user.id;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('mental_fitness_baseline, component_scores, user_archetype, onboarding_completed_at, growth_priority')
        .eq('id', effectiveUserId)
        .maybeSingle();
      
      console.log('[Insights] Profile baseline fetched:', profile);
      
      if (profile) {
        setProfileBaseline({
          mentalFitnessBaseline: profile.mental_fitness_baseline || undefined,
          componentScores: profile.component_scores as Record<string, number> | undefined,
          userArchetype: profile.user_archetype || undefined,
          onboardingCompletedAt: profile.onboarding_completed_at || undefined,
          growthPriority: profile.growth_priority || undefined
        });
      }
    } catch (error) {
      console.error('Error fetching profile baseline:', error);
    }
  };

  const fetchInsightsData = async () => {
    if (!user?.id) return;
    setLoading(true);

    // Use DEV_USER.id in DEV_MODE for consistency
    const effectiveUserId = DEV_MODE ? DEV_USER.id : user.id;

    try {
      // Get last 7 days
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);

      // Fetch check-ins for last 7 days WITH timestamp for Energy Rhythm
      const { data: checkIns, error: checkInsError } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance, outcome, created_at')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: true });

      if (checkInsError) {
        console.error('[Insights] Error fetching check-ins:', checkInsError);
      } else {
        console.log('[Insights] Fetched check-ins:', checkIns?.length || 0, 'for user:', effectiveUserId);
      }

      // Store check-ins with timestamps for Energy Rhythm
      if (checkIns) {
        setCheckInsWithTimestamp(checkIns.map(c => ({
          date: c.checkin_date,
          outcome: c.outcome,
          timestamp: c.created_at
        })));
      }

      // Fetch practice sessions for last 7 days
      const { data: practices } = await supabase
        .from('sanctuary_events')
        .select('category, duration_seconds, event_type, created_at')
        .eq('user_id', effectiveUserId)
        .eq('event_type', 'completed')
        .gte('created_at', startOfDay(sevenDaysAgo).toISOString())
        .lte('created_at', endOfDay(today).toISOString());

      // Build week data
      const days: DayData[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const checkIn = checkIns?.find(c => c.checkin_date === dateStr);
        
        days.push({
          date: dateStr,
          dayLabel: format(date, 'EEE'),
          energyBalance: checkIn?.energy_balance ?? null,
          outcome: checkIn?.outcome ?? null,
          checkInCompleted: !!checkIn
        });
      }
      setWeekData(days);

      // Calculate check-in streak
      let streak = 0;
      for (let i = 0; i < days.length; i++) {
        const dayIndex = days.length - 1 - i;
        if (days[dayIndex].checkInCompleted) {
          streak++;
        } else {
          break;
        }
      }
      setCheckInStreak(streak);

      // Aggregate practice data by category
      const categoryMap = new Map<string, { count: number; totalDuration: number }>();
      practices?.forEach(p => {
        const category = p.category || 'unknown';
        const existing = categoryMap.get(category) || { count: 0, totalDuration: 0 };
        categoryMap.set(category, {
          count: existing.count + 1,
          totalDuration: existing.totalDuration + (p.duration_seconds || 0)
        });
      });

      const practiceStats: PracticeData[] = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' '),
        count: data.count,
        totalDuration: Math.round(data.totalDuration / 60)
      }));
      setPracticeData(practiceStats);

    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTinyWinsInsights = async () => {
    if (!user?.id) return;
    setWinsLoading(true);
    try {
      // DEV_MODE: Direct database query with client-side dimension extraction
      if (DEV_MODE) {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        
        const { data: wins } = await supabase
          .from('tiny_wins')
          .select('win_content, win_date, sentiment, primary_emotion, secondary_emotion, agency_type, regulation_level, growth_signal')
          .eq('user_id', DEV_USER.id)
          .gte('win_date', fourteenDaysAgo.toISOString().split('T')[0])
          .order('win_date', { ascending: false });
        
        console.log('[Insights] DEV_MODE tiny wins fetched:', wins);
        
        // Aggregate dimensions into bubbles - use DB values if present, else extract from text
        const dimensionCounts: Record<string, Record<string, number>> = {
          sentiment: {}, emotion: {}, agency: {}, regulation: {}, growth: {}
        };
        
        wins?.forEach(win => {
          // Check if win has database dimensions populated
          const hasDbDimensions = win.sentiment || win.primary_emotion || win.agency_type || win.regulation_level || win.growth_signal;
          
          if (hasDbDimensions) {
            // Use stored dimensions from database
            if (win.sentiment) dimensionCounts.sentiment[win.sentiment] = (dimensionCounts.sentiment[win.sentiment] || 0) + 1;
            if (win.primary_emotion) dimensionCounts.emotion[win.primary_emotion] = (dimensionCounts.emotion[win.primary_emotion] || 0) + 1;
            if (win.secondary_emotion) dimensionCounts.emotion[win.secondary_emotion] = (dimensionCounts.emotion[win.secondary_emotion] || 0) + 1;
            if (win.agency_type) dimensionCounts.agency[win.agency_type] = (dimensionCounts.agency[win.agency_type] || 0) + 1;
            if (win.regulation_level) dimensionCounts.regulation[win.regulation_level] = (dimensionCounts.regulation[win.regulation_level] || 0) + 1;
            if (win.growth_signal) dimensionCounts.growth[win.growth_signal] = (dimensionCounts.growth[win.growth_signal] || 0) + 1;
          } else if (win.win_content) {
            // Extract dimensions from win text client-side
            const extracted = extractDimensionsFromText(win.win_content);
            extracted.forEach(({ dimension, value }) => {
              if (dimensionCounts[dimension]) {
                dimensionCounts[dimension][value] = (dimensionCounts[dimension][value] || 0) + 1;
              }
            });
          }
        });
        
        const dimensions: { dimension: string; value: string; count: number }[] = [];
        for (const [dimension, values] of Object.entries(dimensionCounts)) {
          for (const [value, count] of Object.entries(values)) {
            dimensions.push({ dimension, value, count });
          }
        }
        dimensions.sort((a, b) => b.count - a.count);
        
        console.log('[Insights] DEV_MODE extracted dimensions:', dimensions);
        
        // Also store raw win content for passing to dimension bubbles
        const winsWithContent = wins?.map(w => ({
          content: w.win_content,
          date: new Date(w.win_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        })) || [];
        setTinyWinsContent(winsWithContent);
        
        setTinyWinsInsights({
          themes: dimensions.slice(0, 5).map(d => d.value),
          dimensions,
          summary: wins?.length 
            ? `You've captured ${wins.length} win${wins.length > 1 ? 's' : ''} recently.` 
            : null,
          winsCount: wins?.length || 0
        });
        setWinsLoading(false);
        return;
      }

      // Production: Use edge function
      const accessToken = await getAccessTokenSilently();
      const { data, error } = await supabase.functions.invoke('tiny-wins-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 14 }
      });
      if (!error && data?.data) {
        setTinyWinsInsights(data.data);
      }
    } catch (error) {
      console.error('Error fetching tiny wins insights:', error);
    } finally {
      setWinsLoading(false);
    }
  };

  const fetchStatePatterns = async () => {
    if (!user?.id) return;
    setPatternsLoading(true);
    try {
      // DEV_MODE: Direct database query
      if (DEV_MODE) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: checkins } = await supabase
          .from('daily_checkins')
          .select('outcome')
          .eq('user_id', DEV_USER.id)
          .gte('checkin_date', sevenDaysAgo.toISOString().split('T')[0]);
        
        const distribution: Record<string, number> = {
          focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0
        };
        
        checkins?.forEach(c => {
          if (c.outcome && Object.prototype.hasOwnProperty.call(distribution, c.outcome)) {
            distribution[c.outcome]++;
          }
        });
        
        setStatePatterns({
          distribution,
          observation: (checkins?.length || 0) >= 7 
            ? 'Your week shows a pattern of varied states.'
            : null,
          checkInCount: checkins?.length || 0
        });
        setPatternsLoading(false);
        return;
      }

      // Production: Use edge function
      const accessToken = await getAccessTokenSilently();
      const { data, error } = await supabase.functions.invoke('state-patterns-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 7 }
      });
      if (!error && data?.data) {
        setStatePatterns(data.data);
      }
    } catch (error) {
      console.error('Error fetching state patterns:', error);
    } finally {
      setPatternsLoading(false);
    }
  };

  const fetchSemanticAnalysis = async () => {
    if (!user?.id) return;
    setSemanticLoading(true);
    try {
      // DEV_MODE: Extract themes from actual data
      if (DEV_MODE) {
        // Query dialogue_messages for coach conversation content
        const { data: messages } = await supabase
          .from('dialogue_messages')
          .select('content, session_id')
          .eq('sender_type', 'user')
          .order('timestamp', { ascending: false })
          .limit(50);

        // Query tiny_wins for win content
        const { data: recentWins } = await supabase
          .from('tiny_wins')
          .select('win_content')
          .eq('user_id', DEV_USER.id)
          .limit(20);

        // Query daily_checkins for state context
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: checkins } = await supabase
          .from('daily_checkins')
          .select('outcome, state_tags')
          .eq('user_id', DEV_USER.id)
          .gte('checkin_date', sevenDaysAgo.toISOString().split('T')[0]);

        // Theme extraction from all sources
        const themeCounts = new Map<string, { count: number; sources: { coach: number; practice: number; wins: number; checkins: number } }>();

        // Extract themes from coach messages
        messages?.forEach(msg => {
          const themes = extractThemesFromContent(msg.content);
          themes.forEach(theme => {
            const existing = themeCounts.get(theme) || { count: 0, sources: { coach: 0, practice: 0, wins: 0, checkins: 0 } };
            existing.count++;
            existing.sources.coach++;
            themeCounts.set(theme, existing);
          });
        });

        // Extract themes from wins
        recentWins?.forEach(win => {
          if (win.win_content) {
            const themes = extractThemesFromContent(win.win_content);
            themes.forEach(theme => {
              const existing = themeCounts.get(theme) || { count: 0, sources: { coach: 0, practice: 0, wins: 0, checkins: 0 } };
              existing.count++;
              existing.sources.wins++;
              themeCounts.set(theme, existing);
            });
          }
        });

        // Add state-based themes from check-ins
        checkins?.forEach(checkin => {
          if (checkin.outcome) {
            const stateTheme = checkin.outcome === 'focused' ? 'focus' : 
                               checkin.outcome === 'steady' ? 'balance' :
                               checkin.outcome === 'scattered' ? 'focus' :
                               checkin.outcome === 'drained' ? 'energy' :
                               checkin.outcome === 'overwhelmed' ? 'stress management' : null;
            if (stateTheme) {
              const existing = themeCounts.get(stateTheme) || { count: 0, sources: { coach: 0, practice: 0, wins: 0, checkins: 0 } };
              existing.count++;
              existing.sources.checkins++;
              themeCounts.set(stateTheme, existing);
            }
          }
        });

        // Convert to unifiedThemes format
        const unifiedThemes = Array.from(themeCounts.entries())
          .map(([theme, data]) => ({
            theme,
            totalCount: data.count,
            weight: Math.min(data.count / 5, 1), // Normalize to 0-1
            sources: data.sources
          }))
          .sort((a, b) => b.totalCount - a.totalCount)
          .slice(0, 12);

        console.log('[Insights] DEV_MODE extracted themes:', unifiedThemes);

        // Generate theme relationships based on co-occurrence
        const themeRelationships: { from: string; to: string; strength: number }[] = [];
        const themeArray = unifiedThemes.slice(0, 8); // Top 8 for relationships
        
        // Create relationships between themes that appear in similar contexts
        for (let i = 0; i < themeArray.length; i++) {
          for (let j = i + 1; j < themeArray.length; j++) {
            const theme1 = themeArray[i];
            const theme2 = themeArray[j];
            
            // Calculate relationship strength based on source overlap
            let overlap = 0;
            if (theme1.sources.coach > 0 && theme2.sources.coach > 0) overlap++;
            if (theme1.sources.wins > 0 && theme2.sources.wins > 0) overlap++;
            if (theme1.sources.checkins > 0 && theme2.sources.checkins > 0) overlap++;
            if (theme1.sources.practice > 0 && theme2.sources.practice > 0) overlap++;
            
            // Also check semantic similarity (simple approach)
            // Expanded semantic pairs for better relationship detection
            const semanticPairs = [
              ['focus', 'clarity'], ['stress', 'overwhelm'], ['balance', 'steady'],
              ['energy', 'activation'], ['calm', 'grounding'], ['growth', 'progress'],
              ['self-awareness', 'presence'], ['emotional regulation', 'calm'],
              ['confidence', 'achievement'], ['resilience', 'growth'],
              ['relationships', 'communication'], ['focus', 'presence'],
              ['energy', 'focus'], ['stress management', 'emotional regulation'],
              ['balance', 'calm'], ['clarity', 'presence'], ['growth', 'learning'],
              ['mastery', 'progress'], ['steady', 'calm'], ['overwhelm', 'stress management']
            ];
            const isSemanticallyRelated = semanticPairs.some(pair => 
              (theme1.theme.toLowerCase().includes(pair[0]) && theme2.theme.toLowerCase().includes(pair[1])) ||
              (theme1.theme.toLowerCase().includes(pair[1]) && theme2.theme.toLowerCase().includes(pair[0]))
            );
            
            // Relaxed criteria: overlap >= 1 (single shared source) OR semantic relationship
            if (overlap >= 1 || isSemanticallyRelated) {
              themeRelationships.push({
                from: theme1.theme,
                to: theme2.theme,
                strength: Math.min((overlap + (isSemanticallyRelated ? 1 : 0)) / 3, 1)
              });
            }
          }
        }

        console.log('[Insights] DEV_MODE generated relationships:', themeRelationships);

        setSemanticAnalysis({
          themePatterns: [],
          unifiedThemes,
          themeRelationships
        });
        setSemanticLoading(false);
        return;
      }

      // Production: Use edge function
      const accessToken = await getAccessTokenSilently();
      const { data, error } = await supabase.functions.invoke('insights-semantic-analysis', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 7, action: 'analyze' }
      });
      if (!error && data?.data) {
        setSemanticAnalysis(data.data);
      }
    } catch (error) {
      console.error('Error fetching semantic analysis:', error);
    } finally {
      setSemanticLoading(false);
    }
  };

  const fetchBubbleDetails = async (keyword: string): Promise<BubbleDetails | null> => {
    try {
      const accessToken = await getAccessTokenSilently();
      const { data, error } = await supabase.functions.invoke('insights-semantic-analysis', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 7, action: 'getBubbleDetails', keyword }
      });
      if (!error && data?.data) {
        return data.data as BubbleDetails;
      }
      return null;
    } catch (error) {
      console.error('Error fetching bubble details:', error);
      return null;
    }
  };

  // Prepare state distribution data for bar chart
  const getStateDistributionData = () => {
    if (!statePatterns?.distribution) return [];
    
    const orderedStates = ['focused', 'steady', 'scattered', 'drained', 'overwhelmed'];
    return orderedStates.map(state => ({
      state: stateLabels[state],
      count: statePatterns.distribution[state] || 0,
      fill: stateColors[state]
    }));
  };

  // Transform Tiny Wins themes to bubble format for unified styling
  const tinyWinsBubbleData = useMemo(() => {
    if (!tinyWinsInsights?.themes || tinyWinsInsights.themes.length === 0) return [];
    return tinyWinsInsights.themes.map((theme, i) => ({
      theme,
      totalCount: 1,
      weight: (tinyWinsInsights.themes.length - i) / tinyWinsInsights.themes.length,
      sources: { coach: 0, practice: 0, wins: 1, checkins: 0 }
    }));
  }, [tinyWinsInsights]);

  // Get progressive message for wins
  const getWinsProgressMessage = () => {
    const count = tinyWinsInsights?.winsCount || 0;
    if (count === 0) return 'Capture your first win during evening integration';
    if (count === 1) return 'First win captured! Each one reveals what you do naturally well.';
    if (count < 5) return `${count} wins logged. Patterns emerge around 5+ wins.`;
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPractices = practiceData.reduce((sum, p) => sum + p.count, 0);
  const stateDistributionData = getStateDistributionData();
  const maxStateCount = Math.max(...stateDistributionData.map(d => d.count), 1);
  const winsProgressMessage = getWinsProgressMessage();

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation - scrolls with content */}
      <div className="relative">
        <FloatingNavigation />

        {/* Hero Banner - matching Recalibrate Studio pattern */}
        <div className="relative h-auto py-8 overflow-hidden">
          <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-3">
            <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
              Your Inner World
            </h1>
            <p className="text-lg font-subheadline italic text-muted-foreground">
              Patterns. Progress. Presence.
            </p>
            <p className="text-sm text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Your longitudinal view of mental fitness development — tracking states, wins, and inner patterns over time.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Baseline Reference Card - Always visible */}
        <BaselineReferenceCard profile={profileBaseline} />

        {/* Weekly Progress Streak */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Progress This Week</span>
              <InsightInfoModal
                title="Your Progress This Week"
                explanation="Tracks your daily ritual completions over the past 7 days. Consistency helps build mental fitness habits that compound over time."
              />
            </div>
          </CardHeader>
          <CardContent>
            <WeeklyRitualStreak />
          </CardContent>
        </LuxuryInsightCard>

        {/* Consolidated Stats - 3 luxury rings */}
        <div className="grid grid-cols-3 gap-4">
          <LuxuryInsightCard>
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col items-center">
                <LuxuryProgressRing 
                  value={checkInStreak} 
                  max={7} 
                  label="Streak"
                  sublabel="days"
                  size="md"
                />
                {insightsTier === 'early' && checkInStreak > 0 && (
                  <p className="text-[10px] text-saffron mt-2">Building consistency</p>
                )}
              </div>
            </CardContent>
          </LuxuryInsightCard>

          <LuxuryInsightCard>
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body mx-auto">Typical State</span>
                </div>
                <p className="text-xl font-headline font-semibold text-foreground capitalize mt-1">
                  {mostCommonState ? stateLabels[mostCommonState] : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">this week</p>
                
                {/* Day 1-2: Show today vs yesterday comparison */}
                {insightsTier === 'early' && todayAndYesterdayStates && (
                  <div className="text-[10px] mt-2 text-muted-foreground">
                    Today: <span className="text-foreground capitalize">{todayAndYesterdayStates.today}</span>
                    {todayAndYesterdayStates.yesterday && (
                      <> • Yesterday: <span className="text-foreground capitalize">{todayAndYesterdayStates.yesterday}</span></>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </LuxuryInsightCard>

          <LuxuryInsightCard>
            <CardContent className="pt-6 pb-4">
              <div className="flex flex-col items-center">
                <LuxuryProgressRing 
                  value={totalPractices} 
                  max={14} 
                  label="Practices"
                  sublabel="completed"
                  size="md"
                />
              </div>
            </CardContent>
          </LuxuryInsightCard>
        </div>

        {/* State Patterns hidden per user request */}

        {/* Calendar-State Patterns - Day 7+ unlock */}
        {insightsTier === 'full' ? (
          <LuxuryInsightCard>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Calendar → State Patterns</span>
                <InsightInfoModal
                  title="Calendar-State Patterns"
                  explanation="Shows how specific calendar events correlate with your emotional state. Understanding these patterns helps you prepare mentally for challenging events."
                />
              </div>
            </CardHeader>
            <CardContent>
              <CalendarStateCorrelations userId={user?.id} />
              <p className="text-xs text-muted-foreground/60 mt-4">
                Days you felt scattered or low energy often correlate with high-decision or back-to-back meetings.
              </p>
            </CardContent>
           </LuxuryInsightCard>
         ) : insightsTier === 'deepening' ? (
           <LuxuryInsightCard>
             <CardHeader className="pb-4">
               <div className="flex items-center justify-between">
                 <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Calendar → State Patterns</span>
                 <InsightInfoModal
                   title="Calendar-State Patterns"
                   explanation="Shows how specific calendar events correlate with your emotional state. This feature unlocks with 7 days of check-in data."
                 />
               </div>
             </CardHeader>
             <CardContent>
               <ProgressiveUnlockMessage
                 currentCount={checkInCount}
                 unlockAt={7}
                 featureName="Calendar Correlations"
                 previewText="Discover how your calendar events affect your mental state."
               />
             </CardContent>
           </LuxuryInsightCard>
         ) : null}

        {/* Behavior-Outcome Patterns - Day 7+ unlock */}
        {insightsTier === 'full' ? (
          <LuxuryInsightCard>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Behavior → Outcome Patterns</span>
                <InsightInfoModal
                  title="Behavior-Outcome Patterns"
                  explanation="Shows how your behavioral responses in moments (confronted, listened, avoided) correlate with your checked-in state. Patterns reveal how your response style affects your mental state."
                />
              </div>
            </CardHeader>
            <CardContent>
              <BehaviorOutcomeCorrelations userId={user?.id} />
              <p className="text-xs text-muted-foreground/60 mt-4">
                How you respond in the moment shapes how you feel afterward.
              </p>
            </CardContent>
          </LuxuryInsightCard>
        ) : insightsTier === 'deepening' ? (
          <LuxuryInsightCard>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Behavior → Outcome Patterns</span>
                <InsightInfoModal
                  title="Behavior-Outcome Patterns"
                  explanation="Shows how your behavioral responses correlate with your mental state. This feature unlocks with 7 days of check-in data."
                />
              </div>
            </CardHeader>
            <CardContent>
              <ProgressiveUnlockMessage
                currentCount={checkInCount}
                unlockAt={7}
                featureName="Behavior Correlations"
                previewText="Discover how your behavioral responses affect your mental state."
              />
            </CardContent>
          </LuxuryInsightCard>
        ) : null}

        {/* Theme Patterns - Day 4+ */}
        {(insightsTier === 'deepening' || insightsTier === 'full') && (
          <LuxuryInsightCard>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Theme Patterns</span>
                <InsightInfoModal
                  title="Theme Patterns"
                  explanation="The psychological frames generated for you based on your state, calendar load, and time of day. Repeated themes reveal what your system is asking for."
                />
              </div>
            </CardHeader>
            <CardContent>
              {semanticLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : semanticAnalysis && semanticAnalysis.themePatterns.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Emerging themes from your {checkInCount} check-ins:
                  </p>
                  {/* Theme bubbles with luxury styling */}
                  <div className="flex flex-wrap gap-2">
                    {semanticAnalysis.themePatterns.map((theme, i) => (
                      <span 
                        key={i} 
                        className="px-4 py-2 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 text-primary rounded-full text-sm font-medium border border-primary/20 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                      >
                        "{theme.phrase}"
                        {theme.count > 1 && (
                          <span className="ml-1 opacity-60">({theme.count}x)</span>
                        )}
                      </span>
                    ))}
                  </div>
                  
                  {/* Driver summary */}
                  <p className="text-xs text-muted-foreground/60">
                    Most common driver: {
                      (() => {
                        const driverCounts = semanticAnalysis.themePatterns.reduce((acc, t) => {
                          acc[t.driver] = (acc[t.driver] || 0) + t.count;
                          return acc;
                        }, {} as Record<string, number>);
                        const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0];
                        return topDriver ? topDriver[0].replace('+', ' + ') : 'state';
                      })()
                    }-based
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  Complete a few more check-ins to see theme patterns.
                </p>
              )}
            </CardContent>
          </LuxuryInsightCard>
        )}

        {/* Your Inner World - Mind Map (Day 5+ or sufficient data) */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Mind Map</span>
              <InsightInfoModal
                title="Your Mind Map"
                explanation="A unified view of themes emerging from your coach conversations, practices, wins, and check-ins. Bubbles are sized by frequency. Lines show conceptually related themes."
              />
            </div>
          </CardHeader>
          <CardContent>
            {semanticLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !mindMapReady ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Your Mind Map builds from coach conversations, practices, and wins.
                </p>
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Keep engaging to see unified themes emerge.
                </p>
              </div>
            ) : (
              <>
                <InnerWorldBubbles
                  items={semanticAnalysis?.unifiedThemes || []}
                  relationships={semanticAnalysis?.themeRelationships || []}
                  onBubbleClick={fetchBubbleDetails}
                />
                {/* Insight space */}
                <div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
                  {semanticAnalysis?.unifiedThemes?.length > 0 ? (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      These themes emerge from your coach conversations, practices, and wins - revealing your inner patterns.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">
                      Engage with the coach and complete practices to see unified themes emerge.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </LuxuryInsightCard>

        {/* Your Tiny Wins - Progressive from Day 1 */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Tiny Wins</span>
              <InsightInfoModal
                title="Your Tiny Wins"
                explanation="Themes extracted from the wins you've captured during evening Integrate sessions with your coach. These reveal what you're naturally doing well."
              />
            </div>
          </CardHeader>
          <CardContent>
            {winsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tinyWinsInsights && tinyWinsInsights.winsCount > 0 ? (
              <div className="space-y-4">
                {/* Progressive message for early wins */}
                {winsProgressMessage && (
                  <p className="text-xs text-saffron/80 mb-2">{winsProgressMessage}</p>
                )}
                
                {/* Psychological dimension bubbles with related wins */}
                {tinyWinsInsights.dimensions && tinyWinsInsights.dimensions.length > 0 ? (
                  <PsychologicalDimensionBubbles
                    data={tinyWinsInsights.dimensions.map(d => ({
                      dimension: d.dimension as 'sentiment' | 'emotion' | 'agency' | 'regulation' | 'growth',
                      value: d.value,
                      count: d.count
                    }))}
                    relatedWins={tinyWinsContent}
                    emptyMessage="Complete evening Integrate flow to capture wins"
                  />
                ) : (
                  <InnerWorldBubbles
                    items={tinyWinsBubbleData}
                    emptyMessage="Complete evening Integrate flow to capture wins"
                  />
                )}
                
                {/* Summary insight */}
                {tinyWinsInsights.summary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tinyWinsInsights.summary}
                  </p>
                )}
                
                {/* Win count */}
                <p className="text-xs text-muted-foreground/60">
                  Based on {tinyWinsInsights.winsCount} wins captured in the past 2 weeks
                </p>
                
                {/* Insight space */}
                <div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
                  <p className="text-xs text-muted-foreground/60">
                    Each bubble represents a psychological dimension from your wins.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  {winsProgressMessage || 'Complete your evening Integrate flow with the Coach to capture wins.'}
                </p>
              </div>
            )}
          </CardContent>
        </LuxuryInsightCard>

        {/* Your Energy Rhythm Heatmap - Progressive from Day 1 */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Energy Rhythm</span>
              <InsightInfoModal
                title="Your Energy Rhythm"
                explanation="Visualizes when you typically check in and how you feel at different times of day. Helps identify your natural energy peaks and dips."
              />
            </div>
          </CardHeader>
          <CardContent>
            <EnergyRhythm 
              checkIns={checkInsWithTimestamp}
            />
            {/* Insight space */}
            <div className="mt-4 p-3 bg-muted/10 rounded-lg min-h-[40px]">
              {checkInsWithTimestamp.length >= 7 ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your energy rhythm reveals natural peaks and dips throughout the week.
                </p>
              ) : checkInsWithTimestamp.length > 0 ? (
                <p className="text-xs text-muted-foreground/60">
                  {7 - checkInsWithTimestamp.length} more check-ins will reveal your energy rhythm.
                </p>
              ) : null}
            </div>
          </CardContent>
        </LuxuryInsightCard>
      </div>
    </div>
  );
};

export default Insights;
