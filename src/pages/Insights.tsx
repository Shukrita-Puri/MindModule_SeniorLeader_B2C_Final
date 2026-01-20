import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import WeeklyRitualStreak from '@/components/home/WeeklyRitualStreak';
import InnerWorldBubbles from '@/components/insights/InnerWorldBubbles';
import EnergyRhythm from '@/components/insights/EnergyRhythm';
import InsightInfoModal from '@/components/insights/InsightInfoModal';

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

  // Calculate most common state this week
  const mostCommonState = useMemo(() => {
    if (!statePatterns?.distribution) return null;
    const entries = Object.entries(statePatterns.distribution);
    if (entries.length === 0) return null;
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0][1] > 0 ? sorted[0][0] : null;
  }, [statePatterns]);

  useEffect(() => {
    if (user?.id) {
      fetchInsightsData();
      fetchTinyWinsInsights();
      fetchStatePatterns();
      fetchSemanticAnalysis();
    }
  }, [user?.id]);

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
        {/* Weekly Progress Streak */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
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
        </Card>

        {/* Consolidated Stats - 3 cards only */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-headline text-foreground/80">Streak</span>
                <InsightInfoModal 
                  title="Check-in Streak"
                  explanation="The number of consecutive days you've completed your daily check-in. Longer streaks indicate consistent self-awareness practice."
                />
              </div>
              <p className="text-2xl font-headline font-semibold">{checkInStreak}</p>
              <p className="text-xs text-muted-foreground">days</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-headline text-foreground/80">Typical State</span>
                <InsightInfoModal 
                  title="Typical State"
                  explanation="The mental state you've checked in with most frequently over the past 7 days. This reveals your baseline energy pattern."
                />
              </div>
              <p className="text-2xl font-headline font-semibold capitalize">
                {mostCommonState ? stateLabels[mostCommonState] : '—'}
              </p>
              <p className="text-xs text-muted-foreground">this week</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-headline text-foreground/80">Practices</span>
                <InsightInfoModal 
                  title="Practices Completed"
                  explanation="Total somatic and mindset practices you've finished this week. Regular practice builds your capacity for self-regulation."
                />
              </div>
              <p className="text-2xl font-headline font-semibold">{totalPractices}</p>
              <p className="text-xs text-muted-foreground">completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Weekly State Patterns */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
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
                {/* Horizontal bar chart */}
                <div className="space-y-3">
                  {stateDistributionData.map((item) => (
                    <div key={item.state} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-24 text-right">
                        {item.state}
                      </span>
                      <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(item.count / maxStateCount) * 100}%`,
                            backgroundColor: item.fill,
                            minWidth: item.count > 0 ? '8px' : '0'
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16">
                        {item.count} {item.count === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* AI observation */}
                {statePatterns.observation && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    "{statePatterns.observation}"
                  </p>
                )}

                {/* Check-in count */}
                <p className="text-xs text-muted-foreground/60">
                  Based on {statePatterns.checkInCount} check-ins this week
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                Complete daily check-ins to see your state patterns.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Theme Patterns */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
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
                {/* Theme bubbles */}
                <div className="flex flex-wrap gap-2">
                  {semanticAnalysis.themePatterns.map((theme, i) => (
                    <span 
                      key={i} 
                      className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium border border-primary/20"
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
                Complete daily check-ins to see your theme patterns.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Your Inner World - Unified Bubble Visualization */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
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
            ) : (
              <InnerWorldBubbles
                items={semanticAnalysis?.unifiedThemes || []}
                relationships={semanticAnalysis?.themeRelationships || []}
                onBubbleClick={fetchBubbleDetails}
              />
            )}
          </CardContent>
        </Card>

        {/* Tiny Wins Patterns - Using unified bubble component */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
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
              <p className="text-sm text-muted-foreground py-4">
                Complete your evening Integrate flow with the Coach to capture wins.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Energy Rhythm Heatmap */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">Energy Rhythm</span>
              <InsightInfoModal
                title="Energy Rhythm"
                explanation="Visualizes when you typically check in and how you feel at different times of day. Helps identify your natural energy peaks and dips."
              />
            </div>
          </CardHeader>
          <CardContent>
            <EnergyRhythm checkIns={checkInsWithTimestamp} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Insights;
