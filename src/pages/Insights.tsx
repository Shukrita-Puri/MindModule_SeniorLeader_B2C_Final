import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
// WeeklyRitualStreak removed — lives on homepage via InsightProgressCard
import InnerWorldBubbles from '@/components/insights/InnerWorldBubbles';
import PsychologicalDimensionBubbles from '@/components/insights/PsychologicalDimensionBubbles';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import LeadershipPatternsCard, { type LeadershipPatternsData } from '@/components/insights/LeadershipPatternsCard';
import PerformanceRhythmCard from '@/components/insights/PerformanceRhythmCard';
import PracticeEffectiveness from '@/components/insights/PracticeEffectiveness';
// BaselineReferenceCard removed — archetype data now lives in LeadershipPatternsCard
import ProgressiveUnlockMessage from '@/components/insights/ProgressiveUnlockMessage';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
// Theme extraction for DEV_MODE Mind Map (lightweight keyword matching)
const THEME_KEYWORDS: Record<string, string[]> = {
  'self-awareness': ['aware', 'realized', 'noticed', 'recognized', 'understood', 'insight', 'clarity'],
  'emotional regulation': ['calm', 'regulated', 'controlled', 'paused', 'breathed', 'centered', 'grounded', 'steady'],
  'stress management': ['stress', 'pressure', 'overwhelmed', 'deadline', 'tension', 'relaxed', 'cope'],
  'focus': ['focused', 'concentrate', 'attention', 'distracted', 'clarity', 'present', 'mindful'],
  'energy': ['energy', 'tired', 'energized', 'drained', 'vitality', 'fatigue', 'rest'],
  'relationships': ['team', 'colleague', 'partner', 'family', 'friend', 'connection', 'together'],
  'communication': ['said', 'told', 'expressed', 'listened', 'conversation', 'discussed', 'shared'],
  'decision making': ['decided', 'chose', 'choice', 'option', 'considered', 'evaluated'],
  'confidence': ['confident', 'believe', 'trust', 'capable', 'ready', 'sure'],
  'resilience': ['bounced', 'recovered', 'persisted', 'despite', 'anyway', 'overcame'],
  'growth': ['learned', 'grew', 'improved', 'progress', 'developed', 'better'],
  'presence': ['present', 'moment', 'now', 'here', 'mindful', 'aware'],
  'gratitude': ['grateful', 'thankful', 'appreciate', 'blessed'],
  'achievement': ['accomplished', 'achieved', 'completed', 'finished', 'done', 'success'],
  'balance': ['balance', 'harmony', 'aligned', 'equilibrium', 'steady'],
};

function extractThemesFromContent(text: string): string[] {
  const lowerText = text.toLowerCase();
  const themes: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(k => lowerText.includes(k))) {
      themes.push(theme);
    }
  }
  return themes;
}

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
  dimensions?: { dimension: string; value: string; count: number; displayLabel?: string; insight?: string }[];
  observation?: string | null;
  patternLine?: string | null;
  summary: string | null;
  winsCount: number;
}

interface StatePatternInsights {
  distribution: Record<string, number>;
  observation: string | null;
  checkInCount: number;
  // New consolidated fields from edge function
  weekData?: DayData[];
  checkInStreak?: number;
  profileBaseline?: ProfileBaseline;
  practiceData?: PracticeData[];
  // LeadershipPatternsCard fields
  aiObservation?: string | null;
  baselineArchetypeId?: string;
  baselineArchetypeTitle?: string;
  currentArchetypeId?: string | null;
  currentArchetypeTitle?: string | null;
  archetypeEvolved?: boolean;
  archetypeLeanOn?: string;
  archetypeWatchFor?: string;
  baselineScores?: { recalibration: number; clarity: number; renewal: number };
  currentScores?: { recalibration: number; clarity: number; renewal: number } | null;
  scoreDeltas?: { recalibration: number; clarity: number; renewal: number } | null;
  frictionPct?: number;
  frictionLabel?: string;
  trendDirection?: 'improving' | 'stable' | 'declining';
  typicalState?: string | null;
  recurringThemes?: { phrase: string; count: number }[];
  coachStrength?: string | null;
  coachFriction?: string | null;
  coachSessionCount?: number;
  hasWearable?: boolean;
  hasCalendar?: boolean;
  dataSourceNote?: string;
}

interface SemanticAnalysis {
  themePatterns: { phrase: string; count: number; driver: string }[];
  unifiedThemes: {
    theme: string;
    totalCount: number;
    weight: number;
    sources: { coach: number; practice: number; wins: number; checkins: number };
  }[];
  themeRelationships: { from: string; to: string; strength: number; type?: string }[];
  aiObservation?: string;
}

interface NodeSummary {
  keyword: string;
  totalCount: number;
  sources: { coach: number; practice: number; wins: number; checkins: number };
  recentDate: string;
  aiSummary: string;
  connectedThemes: { theme: string; relationshipType: string }[];
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

// Insights tier based on check-in count
type InsightsTier = 'baseline' | 'early' | 'summary' | 'deepening' | 'full';

const Insights = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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


  // Mind Map readiness check
  const mindMapReady = useMemo(() => {
    const coachSessions = semanticAnalysis?.unifiedThemes?.reduce((sum, t) => sum + t.sources.coach, 0) || 0;
    const totalPoints = checkInCount + (tinyWinsInsights?.winsCount || 0) + coachSessions;
    return totalPoints >= 3;
  }, [semanticAnalysis, checkInCount, tinyWinsInsights]);

  // Lazy-load Mind Map via IntersectionObserver
  const mindMapRef = useRef<HTMLDivElement>(null);
  const mindMapFetchedRef = useRef(false);

  const fetchSemanticAnalysisLazy = useCallback(() => {
    if (!mindMapFetchedRef.current && user?.id) {
      mindMapFetchedRef.current = true;
      fetchSemanticAnalysis();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!mindMapRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchSemanticAnalysisLazy(); },
      { rootMargin: '200px' }
    );
    observer.observe(mindMapRef.current);
    return () => observer.disconnect();
  }, [fetchSemanticAnalysisLazy]);

  useEffect(() => {
    if (user?.id) {
      // Fire above-fold fetches immediately; Mind Map deferred via IntersectionObserver
      fetchStatePatterns();
      fetchTinyWinsInsights();
    }
  }, [user?.id]);

  // DEV_MODE only: direct database queries for insights data
  const fetchInsightsDataDev = async () => {
    if (!user?.id || !DEV_MODE) return;
    setPatternsLoading(true);
    const effectiveUserId = DEV_USER.id;

    try {
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);

      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance, outcome, created_at')
        .eq('user_id', effectiveUserId)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: true });

      if (checkIns) {
        setCheckInsWithTimestamp(checkIns.map(c => ({
          date: c.checkin_date,
          outcome: c.outcome,
          timestamp: c.created_at
        })));
      }

      const { data: practices } = await supabase
        .from('sanctuary_events')
        .select('category, duration_seconds, event_type, created_at')
        .eq('user_id', effectiveUserId)
        .eq('event_type', 'completed')
        .gte('created_at', startOfDay(sevenDaysAgo).toISOString())
        .lte('created_at', endOfDay(today).toISOString());

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

      let streak = 0;
      for (let i = 0; i < days.length; i++) {
        const dayIndex = days.length - 1 - i;
        if (days[dayIndex].checkInCompleted) streak++;
        else break;
      }
      setCheckInStreak(streak);

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

      // Fetch profile baseline for DEV_MODE
      const { data: profile } = await supabase
        .from('profiles')
        .select('mental_fitness_baseline, component_scores, user_archetype, onboarding_completed_at, growth_priority')
        .eq('id', effectiveUserId)
        .maybeSingle();
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
      console.error('Error fetching DEV_MODE insights:', error);
    } finally {
      setPatternsLoading(false);
    }
  };

  const fetchTinyWinsInsights = async () => {
    if (!user?.id) return;
    setWinsLoading(true);
    try {
      // DEV_MODE: Direct database query with server-side dimensions (no client extraction)
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
        
        // Aggregate dimensions — exclude sentiment (internal only)
        const dimensionCounts: Record<string, Record<string, number>> = {
          emotion: {}, agency: {}, regulation: {}, growth: {}
        };
        
        wins?.forEach(win => {
          if (win.primary_emotion) dimensionCounts.emotion[win.primary_emotion] = (dimensionCounts.emotion[win.primary_emotion] || 0) + 1;
          if (win.secondary_emotion) dimensionCounts.emotion[win.secondary_emotion] = (dimensionCounts.emotion[win.secondary_emotion] || 0) + 1;
          if (win.agency_type) dimensionCounts.agency[win.agency_type] = (dimensionCounts.agency[win.agency_type] || 0) + 1;
          if (win.regulation_level) dimensionCounts.regulation[win.regulation_level] = (dimensionCounts.regulation[win.regulation_level] || 0) + 1;
          if (win.growth_signal) dimensionCounts.growth[win.growth_signal] = (dimensionCounts.growth[win.growth_signal] || 0) + 1;
        });
        
        const displayLabels: Record<string, string> = {
          emotion: 'What you felt',
          agency: 'How you showed up',
          regulation: 'How you led yourself',
          growth: 'What it built',
        };
        
        const dimensions: { dimension: string; value: string; count: number; displayLabel: string }[] = [];
        for (const [dimension, values] of Object.entries(dimensionCounts)) {
          for (const [value, count] of Object.entries(values)) {
            dimensions.push({ dimension, value, count, displayLabel: displayLabels[dimension] || dimension });
          }
        }
        dimensions.sort((a, b) => b.count - a.count);
        
        console.log('[Insights] DEV_MODE extracted dimensions:', dimensions);
        
        const winsWithContent = wins?.map(w => ({
          content: w.win_content,
          date: new Date(w.win_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        })) || [];
        setTinyWinsContent(winsWithContent);
        
        const topEmotion = dimensions.find(d => d.dimension === 'emotion');
        const topGrowth = dimensions.find(d => d.dimension === 'growth');
        
        setTinyWinsInsights({
          themes: dimensions.slice(0, 5).map(d => d.value),
          dimensions,
          observation: topEmotion && topGrowth
            ? `Over the past two weeks your wins most reflect ${topEmotion.value} and ${topGrowth.value}.`
            : wins?.length ? `You've captured ${wins.length} win${wins.length > 1 ? 's' : ''} recently.` : null,
          patternLine: topEmotion && topGrowth
            ? `Your wins over the past 14 days most reflect ${topEmotion.value} and ${topGrowth.value}`
            : null,
          summary: wins?.length 
            ? `You've captured ${wins.length} win${wins.length > 1 ? 's' : ''} recently.` 
            : null,
          winsCount: wins?.length || 0
        });
        setWinsLoading(false);
        return;
      }

      // Production: Use edge function
      const accessToken = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('tiny-wins-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 14 }
      });
      if (!error && data?.data) {
        setTinyWinsInsights(data.data);
        // BUG 2 fix: Populate tinyWinsContent from EF response
        if (data.data.winsContent) {
          setTinyWinsContent(data.data.winsContent);
        }
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
    setLoading(true);
    try {
      // DEV_MODE: Direct database queries + DEV data fetch
      if (DEV_MODE) {
        await fetchInsightsDataDev();
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
        setLoading(false);
        return;
      }

      // Production: Use consolidated edge function response
      const accessToken = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('state-patterns-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { days: 7 }
      });
      if (!error && data?.data) {
        const d = data.data;
        setStatePatterns(d);
        
        // Populate weekData, checkInStreak, profileBaseline, practiceData from consolidated response
        if (d.weekData) setWeekData(d.weekData);
        if (typeof d.checkInStreak === 'number') setCheckInStreak(d.checkInStreak);
        if (d.profileBaseline) setProfileBaseline(d.profileBaseline);
        if (d.practiceData) setPracticeData(d.practiceData);
        
        // Populate checkInsWithTimestamp for Energy Rhythm (if weekData has the data)
        if (d.weekData) {
          setCheckInsWithTimestamp(d.weekData.filter((wd: DayData) => wd.checkInCompleted).map((wd: DayData) => ({
            date: wd.date,
            outcome: wd.outcome,
            timestamp: wd.date + 'T09:00:00Z' // approximate for rhythm card
          })));
        }
        
        console.log('[Insights] Consolidated data loaded:', {
          checkInCount: d.checkInCount,
          weekDataLength: d.weekData?.length,
          streak: d.checkInStreak,
          hasProfile: !!d.profileBaseline,
          practiceCount: d.practiceData?.length
        });
      }
    } catch (error) {
      console.error('Error fetching state patterns:', error);
    } finally {
      setPatternsLoading(false);
      setLoading(false);
    }
  };

  const fetchSemanticAnalysis = async () => {
    if (!user?.id) return;
    setSemanticLoading(true);
    try {
      // DEV_MODE: Extract themes from actual data
      if (DEV_MODE) {
        // BUG 5 fix: Scope dialogue_messages by user's session IDs
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: userSessions } = await supabase
          .from('dialogue_sessions')
          .select('id')
          .eq('user_id', DEV_USER.id)
          .gte('created_at', thirtyDaysAgo.toISOString());
        const sessionIds = (userSessions || []).map((s: any) => s.id);
        let messages: any[] = [];
        if (sessionIds.length > 0) {
          const { data: msgs } = await supabase
            .from('dialogue_messages')
            .select('content, session_id')
            .eq('sender_type', 'user')
            .in('session_id', sessionIds)
            .order('timestamp', { ascending: false })
            .limit(50);
          messages = msgs || [];
        }

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
          .slice(0, 8);

        console.log('[Insights] DEV_MODE extracted themes:', unifiedThemes);

        // Generate theme relationships based on co-occurrence
        const themeRelationships: { from: string; to: string; strength: number; type?: string }[] = [];
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
              // Assign relationship type based on semantic pairs
              const tensionPairs = [['stress', 'overwhelm'], ['energy', 'focus'], ['scattered', 'focus']];
              const groundedPairs = [['calm', 'grounding'], ['balance', 'steady']];
              const feedsPairs = [['stress management', 'emotional regulation'], ['clarity', 'presence']];
              
              let relType = 'often co-occur';
              const t1l = theme1.theme.toLowerCase();
              const t2l = theme2.theme.toLowerCase();
              if (tensionPairs.some(p => (t1l.includes(p[0]) && t2l.includes(p[1])) || (t1l.includes(p[1]) && t2l.includes(p[0])))) {
                relType = 'tension between';
              } else if (groundedPairs.some(p => (t1l.includes(p[0]) && t2l.includes(p[1])) || (t1l.includes(p[1]) && t2l.includes(p[0])))) {
                relType = 'grounded by';
              } else if (feedsPairs.some(p => (t1l.includes(p[0]) && t2l.includes(p[1])) || (t1l.includes(p[1]) && t2l.includes(p[0])))) {
                relType = 'feeds into';
              }

              themeRelationships.push({
                from: theme1.theme,
                to: theme2.theme,
                strength: Math.min((overlap + (isSemanticallyRelated ? 1 : 0)) / 3, 1),
                type: relType
              });
            }
          }
        }

        console.log('[Insights] DEV_MODE generated relationships:', themeRelationships);

        // Generate algorithmic observation for DEV_MODE
        const topTheme = unifiedThemes[0];
        const secondTheme = unifiedThemes[1];
        let devObservation = '';
        if (topTheme && secondTheme) {
          const getTopSrc = (s: typeof topTheme.sources) => {
            const entries = Object.entries(s).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const map: Record<string, string> = { coach: 'coach conversations', practice: 'practices', wins: 'wins', checkins: 'check-ins' };
            return entries.length > 0 ? map[entries[0][0]] || 'your reflections' : 'your reflections';
          };
          devObservation = `Your inner world is currently shaped by ${topTheme.theme} and ${secondTheme.theme}, surfacing most in your ${getTopSrc(topTheme.sources)}. These recurring patterns suggest where your attention and energy are drawn right now.`;
        }

        setSemanticAnalysis({
          themePatterns: [],
          unifiedThemes,
          themeRelationships,
          aiObservation: devObservation,
        });
        setSemanticLoading(false);
        return;
      }

      // Production: Use edge function
      const accessToken = await getAuthToken();
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

  const fetchNodeSummary = async (keyword: string): Promise<NodeSummary | null> => {
    try {
      if (DEV_MODE) {
        // DEV_MODE: generate a simple algorithmic summary
        const theme = semanticAnalysis?.unifiedThemes.find(t => t.theme === keyword);
        if (!theme) return null;
        const sources = theme.sources;
        const topSource = Object.entries(sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const topSourceName = topSource.length > 0 
          ? { coach: 'coach conversations', practice: 'practices', wins: 'wins', checkins: 'check-ins' }[topSource[0][0]] || 'your reflections'
          : 'your reflections';
        
        // Find connected themes from relationships
        const connected = (semanticAnalysis?.themeRelationships || [])
          .filter(r => r.from.toLowerCase() === keyword.toLowerCase() || r.to.toLowerCase() === keyword.toLowerCase())
          .map(r => ({
            theme: r.from.toLowerCase() === keyword.toLowerCase() ? r.to : r.from,
            relationshipType: r.type || 'often co-occur'
          }))
          .slice(0, 3);

        return {
          keyword,
          totalCount: theme.totalCount,
          sources,
          recentDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          aiSummary: `${keyword} has appeared ${theme.totalCount} times across your ${topSourceName}. ${connected.length > 0 ? `It tends to surface alongside ${connected[0].theme}.` : 'This is one of your most consistent patterns.'}`,
          connectedThemes: connected
        };
      }

      const accessToken = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('insights-semantic-analysis', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { 
          days: 7, 
          action: 'getNodeSummary', 
          keyword,
          relationships: semanticAnalysis?.themeRelationships || []
        }
      });
      if (!error && data?.data) {
        return data.data as NodeSummary;
      }
      return null;
    } catch (error) {
      console.error('Error fetching node summary:', error);
      return null;
    }
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
    if (count === 0) return 'Capture your first win during evening integration to start building your momentum map';
    if (count === 1) return 'First win captured! Log 2 more to see your dimension map';
    if (count < 3) return `${count} wins so far — log ${3 - count} more for your dimension map`;
    if (count < 5) return 'Your momentum map is building. At 5 wins, an AI observation will appear';
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              What is consistently true about how you lead, perform, and recover — drawn from everything the app knows about you.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Your Self Mastery Patterns — pass pre-fetched data to avoid duplicate edge call */}
        <LeadershipPatternsCard userId={user?.id} prefetchedData={statePatterns} />

        {/* Card 2 — Your Momentum (moved up from Card 6) */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Momentum</span>
              <InsightInfoModal
                title="Your Momentum"
                explanation="The wins you've logged over the past two weeks — and what they reveal about your momentum, how you're showing up, and what you're building. At this level, few people reflect your progress back to you. This card does."
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
                {/* AI observation — only show at 10+ wins */}
                {tinyWinsInsights.winsCount >= 5 && tinyWinsInsights.observation && (
                  <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
                    <p className="text-sm text-foreground leading-relaxed">
                      {tinyWinsInsights.observation}
                    </p>
                  </div>
                )}
                {winsProgressMessage && (
                  <p className="text-xs text-saffron/80 mb-2">{winsProgressMessage}</p>
                )}
                {tinyWinsInsights.dimensions && tinyWinsInsights.dimensions.length > 0 ? (
                  tinyWinsInsights.winsCount >= 3 ? (
                    /* 5+ wins with dimensions: show full bubble chart */
                    <PsychologicalDimensionBubbles
                      data={tinyWinsInsights.dimensions.map(d => ({
                        dimension: d.dimension as 'emotion' | 'agency' | 'regulation' | 'growth',
                        value: d.value,
                        count: d.count,
                        displayLabel: d.displayLabel,
                        insight: d.insight,
                      }))}
                      relatedWins={tinyWinsContent}
                      emptyMessage="Complete evening Integrate flow to capture wins"
                    />
                  ) : (
                    /* 1-4 wins with dimensions: show text summary of top dimensions */
                    <div className="p-3 bg-muted/20 border border-border/30 rounded-lg">
                      <p className="text-sm text-foreground leading-relaxed">
                        Your recent wins reflect{' '}
                        <span className="font-medium">
                          {tinyWinsInsights.dimensions
                            .slice(0, 3)
                            .map(d => d.value)
                            .join(', ')
                            .replace(/, ([^,]*)$/, ' and $1')}
                        </span>.
                      </p>
                    </div>
                  )
                ) : tinyWinsContent.length > 0 ? (
                  /* Wins exist but no dimensions extracted yet — show recent win texts */
                  <div className="space-y-2">
                    {tinyWinsContent.slice(0, 3).map((win, i) => (
                      <div key={i} className="p-2.5 bg-muted/30 rounded-lg border border-border/20">
                        <p className="text-sm text-foreground leading-relaxed line-clamp-2">"{win.content}"</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{win.date}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <InnerWorldBubbles
                    items={tinyWinsBubbleData}
                    emptyMessage="Complete evening Integrate flow to capture wins"
                  />
                )}
                {tinyWinsInsights.patternLine && tinyWinsInsights.winsCount >= 3 && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tinyWinsInsights.patternLine}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/60">
                  Based on {tinyWinsInsights.winsCount} win{tinyWinsInsights.winsCount !== 1 ? 's' : ''} captured in the past 2 weeks
                </p>
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

        {/* Card 3 — Your Performance Rhythm */}
        <PerformanceRhythmCard userId={user?.id} />

        {/* Card 5 — Your Mind Map */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your Mind Map</span>
              <InsightInfoModal
                title="Your Mind Map"
                explanation="The recurring themes, patterns, and preoccupations that surface across your check-ins, coaching sessions, and practices. Not what you reported on any single day — what keeps coming up. The picture your data is painting of your inner world right now."
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
                {/* AI Observation above the bubble map */}
                {semanticAnalysis?.aiObservation && (
                  <div className="mb-4 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                    <p className="text-sm text-foreground leading-relaxed">
                      {semanticAnalysis.aiObservation}
                    </p>
                  </div>
                )}
                <InnerWorldBubbles
                  items={semanticAnalysis?.unifiedThemes || []}
                  relationships={semanticAnalysis?.themeRelationships || []}
                  onNodeSummary={fetchNodeSummary}
                />
              </>
            )}
          </CardContent>
        </LuxuryInsightCard>
      </div>
    </div>
  );
};

export default Insights;
