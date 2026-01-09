import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Activity, Calendar, Compass, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

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

const Insights = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [practiceData, setPracticeData] = useState<PracticeData[]>([]);
  const [checkInStreak, setCheckInStreak] = useState(0);

  useEffect(() => {
    if (user?.id) {
      fetchInsightsData();
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

  const getOutcomeColor = (outcome: string | null) => {
    switch (outcome) {
      case 'power-up': return 'hsl(var(--accent))';
      case 'pause': return 'hsl(var(--primary))';
      case 'presence': return 'hsl(142 76% 36%)';
      default: return 'hsl(var(--muted))';
    }
  };

  const getCategoryColor = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes('power') || lower.includes('renewal')) return 'hsl(var(--accent))';
    if (lower.includes('pause')) return 'hsl(var(--primary))';
    if (lower.includes('presence') || lower.includes('flow')) return 'hsl(142 76% 36%)';
    return 'hsl(var(--muted-foreground))';
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
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/executive-home')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-headline font-semibold">Insights</h1>
            <p className="text-sm text-muted-foreground">Past 7 days</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
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
                    <Tooltip 
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
                    <Tooltip 
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
