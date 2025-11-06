import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, Calendar, AlertCircle } from 'lucide-react';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';
import { getPhysiologicalHistory, analyzeEventPhysiologicalPattern, type HistoricalPhysiologicalEvent } from '@/utils/historicalPhysiologicalTracking';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const HRVInsightsDashboard = () => {
  const [history, setHistory] = useState<HistoricalPhysiologicalEvent[]>([]);
  const [eventTypeStats, setEventTypeStats] = useState<Record<string, { count: number; avgHRV: number }>>({});

  useEffect(() => {
    loadHRVData();
  }, []);

  const loadHRVData = () => {
    const physHistory = getPhysiologicalHistory();
    setHistory(physHistory);

    // Calculate stats by event type
    const stats: Record<string, { count: number; avgHRV: number; totalHRV: number }> = {};
    
    physHistory.forEach(event => {
      if (!stats[event.eventType]) {
        stats[event.eventType] = { count: 0, avgHRV: 0, totalHRV: 0 };
      }
      stats[event.eventType].count++;
      stats[event.eventType].totalHRV += event.hrv || 0;
    });

    // Calculate averages
    Object.keys(stats).forEach(type => {
      stats[type].avgHRV = Math.round(stats[type].totalHRV / stats[type].count);
    });

    setEventTypeStats(stats as Record<string, { count: number; avgHRV: number }>);
  };

  // Prepare chart data
  const chartData = history
    .slice(-14) // Last 14 events
    .map(event => ({
      date: new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      hrv: event.hrv,
      eventTitle: event.eventTitle.substring(0, 20) + '...'
    }));

  const eventTypeChartData = Object.entries(eventTypeStats).map(([type, stats]) => ({
    eventType: type.replace(/-/g, ' '),
    avgHRV: stats.avgHRV,
    count: stats.count
  }));

  const getStressLevel = (hrv: number) => {
    if (hrv > 85) return { label: 'High Stress', color: 'bg-red-500', textColor: 'text-red-600' };
    if (hrv > 65) return { label: 'Moderate', color: 'bg-yellow-500', textColor: 'text-yellow-600' };
    return { label: 'Low Stress', color: 'bg-green-500', textColor: 'text-green-600' };
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <UnifiedTopBar backPath="/executive-home" />
      
      <div className="pt-20 px-4 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-headline mb-2 text-foreground">HRV Insights</h1>
          <p className="text-muted-foreground">Understanding your stress patterns</p>
        </div>

        {history.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No HRV Data Yet</h3>
            <p className="text-sm text-muted-foreground">
              Connect your wearable device and calendar to start tracking HRV patterns during meetings and events.
            </p>
          </Card>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Events Tracked</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{history.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Average HRV</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {Math.round(history.reduce((sum, e) => sum + e.hrv, 0) / history.length)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getStressLevel(Math.round(history.reduce((sum, e) => sum + e.hrv, 0) / history.length)).label}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Event Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{Object.keys(eventTypeStats).length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Different categories</p>
                </CardContent>
              </Card>
            </div>

            {/* HRV Over Time Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  HRV Trend Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Line type="monotone" dataKey="hrv" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Lower HRV = Less stress | Higher HRV = More stress
                </p>
              </CardContent>
            </Card>

            {/* Event Type Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Stress by Event Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={eventTypeChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="eventType" className="text-xs" angle={-45} textAnchor="end" height={80} />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Bar dataKey="avgHRV" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recent Events */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.slice(-10).reverse().map((event) => {
                    const stress = getStressLevel(event.hrv);
                    return (
                      <div key={event.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold">{event.eventTitle}</h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })} • {event.eventType.replace(/-/g, ' ')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-lg font-bold">{event.hrv}</div>
                            <Badge variant="outline" className={`text-xs ${stress.textColor}`}>
                              {stress.label}
                            </Badge>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${stress.color}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Key Insights */}
            <Card className="bg-gradient-to-br from-saffron/5 to-gold/5 border-saffron/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-saffron" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(eventTypeStats)
                  .sort((a, b) => b[1].avgHRV - a[1].avgHRV)
                  .slice(0, 3)
                  .map(([type, stats]) => (
                    <div key={type} className="p-3 bg-background/50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-semibold capitalize">{type.replace(/-/g, ' ')}</h4>
                        <Badge>{stats.avgHRV} avg HRV</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.avgHRV > 80 ? (
                          <>⚠️ High stress pattern detected. Consider scheduling grounding practices before these events.</>
                        ) : stats.avgHRV > 60 ? (
                          <>✓ Moderate stress. Pre-event preparation could help optimize performance.</>
                        ) : (
                          <>✓ Low stress pattern. Your preparation for these events is working well.</>
                        )}
                      </p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default HRVInsightsDashboard;
