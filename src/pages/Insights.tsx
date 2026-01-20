import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Compass, Loader2, Sparkles, Brain, Target, Clock } from 'lucide-react';
import { ChatCircle } from '@phosphor-icons/react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import WeeklyRitualStreak from '@/components/home/WeeklyRitualStreak';
import InnerWorldBubbles from '@/components/insights/InnerWorldBubbles';
import EnergyRhythm from '@/components/insights/EnergyRhythm';

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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/executive-home')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-headline font-semibold">Your Inner World</h1>
              <p className="text-sm text-muted-foreground">Past 7 days</p>
            </div>
          </div>
          
          {/* Coach Button */}
          <UITooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => navigate('/coach')}>
                <ChatCircle size={20} weight="duotone" className="icon-duotone-luxury text-saffron" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Self Mastery Coach</p>
            </TooltipContent>
          </UITooltip>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Weekly Progress Streak */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Progress This Week</CardTitle>
            <CardDescription>Daily ritual completion streak</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyRitualStreak />
          </CardContent>
        </Card>

        {/* Consolidated Stats - 3 cards only */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Streak</span>
              </div>
              <p className="text-2xl font-headline font-semibold">{checkInStreak}</p>
              <p className="text-xs text-muted-foreground">days</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Brain className="h-4 w-4" />
                <span className="text-xs">Typical State</span>
              </div>
              <p className="text-2xl font-headline font-semibold capitalize">
                {mostCommonState ? stateLabels[mostCommonState] : '—'}
              </p>
              <p className="text-xs text-muted-foreground">this week</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Compass className="h-4 w-4" />
                <span className="text-xs">Practices</span>
              </div>
              <p className="text-2xl font-headline font-semibold">{totalPractices}</p>
              <p className="text-xs text-muted-foreground">completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Weekly State Patterns */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-saffron" />
              <CardTitle className="text-lg">Your State Patterns</CardTitle>
            </div>
            <CardDescription>How you've been showing up this week</CardDescription>
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-saffron" />
              <CardTitle className="text-lg">Theme Patterns</CardTitle>
            </div>
            <CardDescription>Your psychological frames this week</CardDescription>
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-saffron" />
              <CardTitle className="text-lg">Your Inner World</CardTitle>
            </div>
            <CardDescription>Themes emerging from your conversations and practices</CardDescription>
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-saffron" />
              <CardTitle className="text-lg">Tiny Wins Patterns</CardTitle>
            </div>
            <CardDescription>What you've been winning at this week</CardDescription>
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
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-saffron" />
              <CardTitle className="text-lg">Energy Rhythm</CardTitle>
            </div>
            <CardDescription>When you check in and how you feel</CardDescription>
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
