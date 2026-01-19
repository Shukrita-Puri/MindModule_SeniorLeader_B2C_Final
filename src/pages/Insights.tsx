import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Activity, Calendar, Compass, Loader2, Sparkles, Brain } from 'lucide-react';
import { ChatCircle } from '@phosphor-icons/react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import WeeklyRitualStreak from '@/components/home/WeeklyRitualStreak';

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

// State colors for the bar chart
const stateColors: Record<string, string> = {
  focused: 'hsl(142 76% 36%)',
  steady: 'hsl(217 91% 60%)',
  scattered: 'hsl(38 92% 50%)',
  drained: 'hsl(0 0% 62%)',
  overwhelmed: 'hsl(0 84% 60%)'
};

const Insights = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [practiceData, setPracticeData] = useState<PracticeData[]>([]);
  const [checkInStreak, setCheckInStreak] = useState(0);
  const [tinyWinsInsights, setTinyWinsInsights] = useState<TinyWinsInsights | null>(null);
  const [winsLoading, setWinsLoading] = useState(false);
  const [statePatterns, setStatePatterns] = useState<StatePatternInsights | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [checkInStreak, setCheckInStreak] = useState(0);
  const [tinyWinsInsights, setTinyWinsInsights] = useState<TinyWinsInsights | null>(null);
  const [winsLoading, setWinsLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchInsightsData();
      fetchTinyWinsInsights();
      fetchStatePatterns();
    }
  }, [user?.id]);
    }
  }, [user?.id]);

  const fetchInsightsData = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // Get last 7 days
      const today = new Date();
      const sevenDaysAgo = subDays(today, 6);

      // Fetch check-ins for last 7 days
      const { data: checkIns } = await supabase
        .from('daily_checkins')
        .select('checkin_date, energy_balance, outcome')
        .eq('user_id', user.id)
        .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lte('checkin_date', format(today, 'yyyy-MM-dd'))
        .order('checkin_date', { ascending: true });

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

  const getOutcomeColor = (outcome: string | null) => {
    switch (outcome) {
      case 'power-up': return 'hsl(var(--accent))';
      case 'pause': return 'hsl(var(--primary))';
      case 'presence': return 'hsl(142 76% 36%)';
      default: return 'hsl(var(--muted))';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const validEnergyData = weekData.filter(d => d.energyBalance !== null);
  const avgEnergy = validEnergyData.length > 0 
    ? Math.round(validEnergyData.reduce((sum, d) => sum + (d.energyBalance || 0), 0) / validEnergyData.length)
    : null;
  const totalPractices = practiceData.reduce((sum, p) => sum + p.count, 0);
  const totalMinutes = practiceData.reduce((sum, p) => sum + p.totalDuration, 0);

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
              <h1 className="text-2xl font-headline font-semibold">Insights</h1>
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
        {/* Weekly Progress Streak - Moved from Homepage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Progress This Week</CardTitle>
            <CardDescription>Daily ritual completion streak</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyRitualStreak />
          </CardContent>
        </Card>

        {/* Tiny Wins Patterns */}
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
                {/* Theme tags */}
                <div className="flex flex-wrap gap-2">
                  {tinyWinsInsights.themes.map((theme, i) => (
                    <span key={i} className="px-3 py-1 bg-saffron/10 text-saffron rounded-full text-sm font-medium">
                      {theme}
                    </span>
                  ))}
                </div>
                
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

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Check-in Streak</span>
              </div>
              <p className="text-3xl font-headline font-semibold">{checkInStreak}</p>
              <p className="text-xs text-muted-foreground">days</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Avg Energy</span>
              </div>
              <p className="text-3xl font-headline font-semibold">
                {avgEnergy !== null ? `${avgEnergy > 0 ? '+' : ''}${avgEnergy}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">balance</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Compass className="h-4 w-4" />
                <span className="text-xs">Practices</span>
              </div>
              <p className="text-3xl font-headline font-semibold">{totalPractices}</p>
              <p className="text-xs text-muted-foreground">completed</p>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Time Invested</span>
              </div>
              <p className="text-3xl font-headline font-semibold">{totalMinutes}</p>
              <p className="text-xs text-muted-foreground">minutes</p>
            </CardContent>
          </Card>
        </div>

        {/* Energy Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Energy Balance Trend</CardTitle>
            <CardDescription>Your daily energy balance over the past week</CardDescription>
          </CardHeader>
          <CardContent>
            {validEnergyData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="dayLabel" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      domain={[-5, 5]}
                    />
                    <ChartTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="energyBalance" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p>No check-in data yet. Start your daily check-ins to see trends.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Check-in Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Check-in Patterns</CardTitle>
            <CardDescription>Your energy states this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 justify-between">
              {weekData.map((day) => (
                <div key={day.date} className="flex-1 text-center">
                  <div 
                    className="w-full aspect-square rounded-lg mb-2 flex items-center justify-center"
                    style={{ 
                      backgroundColor: day.checkInCompleted 
                        ? getOutcomeColor(day.outcome) 
                        : 'hsl(var(--muted))',
                      opacity: day.checkInCompleted ? 1 : 0.3
                    }}
                  >
                    {day.checkInCompleted && (
                      <span className="text-xs text-white font-medium">
                        {day.energyBalance !== null ? (day.energyBalance > 0 ? '+' : '') + day.energyBalance : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{day.dayLabel}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 justify-center text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getOutcomeColor('power-up') }} />
                <span>Renewal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getOutcomeColor('pause') }} />
                <span>Pause</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getOutcomeColor('presence') }} />
                <span>Flow</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Practice History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Practice History</CardTitle>
            <CardDescription>Sessions completed by category</CardDescription>
          </CardHeader>
          <CardContent>
            {practiceData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={practiceData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis 
                      type="category" 
                      dataKey="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      width={100}
                    />
                    <ChartTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'count' ? `${value} sessions` : `${value} mins`,
                        name === 'count' ? 'Sessions' : 'Duration'
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {practiceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCategoryColor(entry.category)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                <p>No practice sessions yet. Visit Recalibrate Studio to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Insights;
