import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import WeeklyRitualStreak from '@/components/home/WeeklyRitualStreak';
import InnerWorldBubbles from '@/components/insights/InnerWorldBubbles';
import EnergyRhythm from '@/components/insights/EnergyRhythm';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import CalendarStateCorrelations from '@/components/insights/CalendarStateCorrelations';
import BaselineReferenceCard from '@/components/insights/BaselineReferenceCard';
import ProgressiveUnlockMessage from '@/components/insights/ProgressiveUnlockMessage';
import LuxuryProgressRing from '@/components/insights/LuxuryProgressRing';
import LuxuryStateBar from '@/components/insights/LuxuryStateBar';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('mental_fitness_baseline, component_scores, user_archetype, onboarding_completed_at, growth_priority')
        .eq('id', user.id)
        .single();
      
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

    try {
      // Get last 7 days
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);

      // Fetch check-ins for last 7 days WITH timestamp for Energy Rhythm
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance, outcome, created_at')
        .eq('user_id', user.id)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: true });

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
        .eq('user_id', user.id)
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

        {/* Page Header - centered */}
        <div className="pb-4 px-4 max-w-4xl mx-auto text-center">
          <h1 className="text-2xl md:text-3xl font-headline text-foreground tracking-tight">Your Inner World</h1>
          <p className="text-sm text-muted-foreground mt-1">Past 7 days</p>
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

        {/* Weekly State Patterns - with luxury bars */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Your State Patterns</span>
              <InsightInfoModal
                title="Your State Patterns"
                explanation="Shows the distribution of mental states you've reported in your daily check-ins this week. Recognizing patterns helps you understand your typical energy rhythms."
              />
            </div>
          </CardHeader>
          <CardContent>
            {patternsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : statePatterns && statePatterns.checkInCount > 0 ? (
              <div className="space-y-6">
                {/* Luxury bar chart */}
                <LuxuryStateBar 
                  data={stateDistributionData}
                  maxCount={maxStateCount}
                  checkInCount={checkInCount}
                />

                {/* Divider */}
                <div className="border-t border-border/50" />

                {/* Day 3+ factual summary (no trend arrows until Day 7) */}
                {insightsTier === 'summary' && mostCommonState && (
                  <p className="text-sm text-muted-foreground p-3 bg-muted/20 rounded-lg leading-relaxed">
                    In {checkInCount} check-ins, you've felt <span className="text-foreground font-medium capitalize">{stateLabels[mostCommonState]}</span> most often. 
                    A few more days will reveal if this is your typical pattern.
                  </p>
                )}

                {/* Day 7+ full observation with trend arrows */}
                {insightsTier === 'full' && statePatterns.observation && (
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      "{statePatterns.observation}"
                    </p>
                  </div>
                )}

                {/* Check-in count */}
                <p className="text-xs text-muted-foreground/60">
                  Based on {statePatterns.checkInCount} check-ins this week
                </p>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Complete daily check-ins to see your state patterns.
                </p>
                {profileBaseline?.mentalFitnessBaseline && (
                  <p className="text-xs text-saffron/70 mt-2">
                    Your baseline score is {profileBaseline.mentalFitnessBaseline}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </LuxuryInsightCard>

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
              <InnerWorldBubbles
                items={semanticAnalysis?.unifiedThemes || []}
                relationships={semanticAnalysis?.themeRelationships || []}
                onBubbleClick={fetchBubbleDetails}
              />
            )}
          </CardContent>
        </LuxuryInsightCard>

        {/* Tiny Wins Patterns - Progressive from Day 1 */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Tiny Wins Patterns</span>
              <InsightInfoModal
                title="Tiny Wins Patterns"
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
                
                {/* Unified bubble visualization for Tiny Wins */}
                <InnerWorldBubbles
                  items={tinyWinsBubbleData}
                  emptyMessage="Complete evening Integrate flow to capture wins"
                />
                
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

        {/* Energy Rhythm Heatmap - Progressive from Day 1 */}
        <LuxuryInsightCard>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Energy Rhythm</span>
              <InsightInfoModal
                title="Energy Rhythm"
                explanation="Visualizes when you typically check in and how you feel at different times of day. Helps identify your natural energy peaks and dips."
              />
            </div>
          </CardHeader>
          <CardContent>
            <EnergyRhythm 
              checkIns={checkInsWithTimestamp}
            />
          </CardContent>
        </LuxuryInsightCard>
      </div>
    </div>
  );
};

export default Insights;
