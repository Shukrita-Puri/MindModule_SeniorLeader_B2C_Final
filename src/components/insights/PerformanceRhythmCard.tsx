import { useEffect, useState } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface HeatmapCell {
  outcome: string | null;
  avgScore: number | null;
  divergence: boolean;
}

interface PerformanceRhythmData {
  heatmap: Record<string, Record<string, HeatmapCell>>;
  bestWindow: string | null;
  observations: string[];
  hasCalendar: boolean;
  checkInCount: number;
}

interface PerformanceRhythmCardProps {
  userId?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_WINDOWS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

const stateColors: Record<string, { gradient: string; glow: string }> = {
  focused: {
    gradient: 'from-green-400 via-green-500 to-green-600',
    glow: 'rgba(34, 197, 94, 0.4)',
  },
  steady: {
    gradient: 'from-blue-400 via-blue-500 to-blue-600',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  scattered: {
    gradient: 'from-amber-400 via-amber-500 to-amber-600',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  drained: {
    gradient: 'from-slate-300 via-slate-400 to-slate-500',
    glow: 'rgba(148, 163, 184, 0.4)',
  },
  overwhelmed: {
    gradient: 'from-red-400 via-red-500 to-red-600',
    glow: 'rgba(239, 68, 68, 0.4)',
  },
};

const PerformanceRhythmCard = ({ userId }: PerformanceRhythmCardProps) => {
  const [data, setData] = useState<PerformanceRhythmData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);

    try {
      if (DEV_MODE) {
        // DEV_MODE: compute locally from direct DB queries
        const effectiveUserId = DEV_USER.id;
        const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

        const [checkInsRes, calConnRes, calEventsRes, behaviorRes] = await Promise.all([
          supabase
            .from('daily_checkins')
            .select('outcome, energy_balance, checkin_date, created_at')
            .eq('user_id', effectiveUserId)
            .gte('checkin_date', thirtyDaysAgo)
            .order('created_at', { ascending: false }),
          supabase
            .from('calendar_connections')
            .select('is_active')
            .eq('user_id', effectiveUserId)
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('calendar_events')
            .select('title, start_time')
            .eq('user_id', effectiveUserId)
            .gte('start_time', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('behavior_logs')
            .select('behavior_type, created_at')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
        ]);

        const checkIns = checkInsRes.data || [];
        const hasCalendar = !!calConnRes.data?.is_active;
        const calendarEvents = calEventsRes.data || [];
        const behaviorLogs = behaviorRes.data || [];

        // Build heatmap
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const getTimeWindow = (h: number) => h >= 5 && h <= 11 ? 'morning' : h >= 12 && h <= 17 ? 'afternoon' : 'evening';

        const cellOutcomes: Record<string, Record<string, { outcome: string | null; t: number }>> = {};
        const cellScores: Record<string, Record<string, number[]>> = {};
        for (const tw of ['morning', 'afternoon', 'evening']) {
          cellOutcomes[tw] = {};
          cellScores[tw] = {};
          for (const d of DAYS) {
            cellOutcomes[tw][d] = { outcome: null, t: 0 };
            cellScores[tw][d] = [];
          }
        }

        for (const ci of checkIns) {
          if (!ci.created_at) continue;
          const date = new Date(ci.created_at);
          const tw = getTimeWindow(date.getHours());
          const day = dayLabels[date.getDay()];
          const t = date.getTime();
          if (ci.outcome && t > cellOutcomes[tw][day].t) {
            cellOutcomes[tw][day] = { outcome: ci.outcome, t };
          }
          if (ci.energy_balance != null) cellScores[tw][day].push(ci.energy_balance);
        }

        const heatmap: Record<string, Record<string, HeatmapCell>> = {};
        let bestScore = -1, bestLabel = '';
        for (const tw of ['morning', 'afternoon', 'evening']) {
          heatmap[tw] = {};
          for (const d of DAYS) {
            const outcome = cellOutcomes[tw][d].outcome;
            const scores = cellScores[tw][d];
            const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
            const divergence = outcome === 'focused' && avgScore !== null && avgScore < 50;
            heatmap[tw][d] = { outcome, avgScore, divergence };
            if (avgScore !== null && avgScore > bestScore) {
              bestScore = avgScore;
              bestLabel = `${d} ${tw === 'morning' ? 'mornings' : tw === 'afternoon' ? 'afternoons' : 'evenings'}`;
            }
          }
        }

        // Simple observations for dev
        const observations: string[] = [];
        // Calendar observation (simplified)
        if (hasCalendar && calendarEvents.length > 0 && checkIns.length >= 5) {
          const keywords = ['board', 'quarterly', 'investor', 'pitch', 'review', 'presentation', 'interview', 'deadline', 'client', 'all-hands', 'performance', 'budget', 'strategy', 'executive', 'stakeholder'];
          const dateOutcomes: Record<string, string[]> = {};
          checkIns.forEach(ci => {
            if (ci.outcome) {
              if (!dateOutcomes[ci.checkin_date]) dateOutcomes[ci.checkin_date] = [];
              dateOutcomes[ci.checkin_date].push(ci.outcome);
            }
          });
          const kwDays: Record<string, Set<string>> = {};
          calendarEvents.forEach(e => {
            if (!e.title) return;
            const tl = e.title.toLowerCase();
            const ed = new Date(e.start_time).toISOString().split('T')[0];
            keywords.forEach(kw => { if (tl.includes(kw)) { if (!kwDays[kw]) kwDays[kw] = new Set(); kwDays[kw].add(ed); } });
          });
          for (const [kw, dates] of Object.entries(kwDays)) {
            const oc: Record<string, number> = {};
            let total = 0;
            Array.from(dates).forEach(d => {
              (dateOutcomes[d] || []).forEach(o => { oc[o] = (oc[o] || 0) + 1; total++; });
            });
            if (total >= 3) {
              const sorted = Object.entries(oc).sort((a, b) => b[1] - a[1]);
              if (sorted[0][1] / total >= 0.5) {
                observations.push(`On days with ${kw.charAt(0).toUpperCase() + kw.slice(1)} events, you tend to check in ${sorted[0][0]} ${Math.round(sorted[0][1] / total * 100)}% of the time — observed across ${total} occurrences.`);
              }
            }
            if (observations.length >= 2) break;
          }
        }
        // Behavior observation
        if (behaviorLogs.length > 0 && checkIns.length > 0 && observations.length < 2) {
          const bo = new Map<string, Map<string, number>>();
          behaviorLogs.forEach(b => {
            const bd = new Date(b.created_at).toISOString().split('T')[0];
            const type = b.behavior_type?.toLowerCase();
            if (!type) return;
            checkIns.forEach(ci => {
              const diff = (new Date(ci.checkin_date).getTime() - new Date(bd).getTime()) / 86400000;
              if (diff >= 0 && diff <= 1 && ci.outcome) {
                if (!bo.has(type)) bo.set(type, new Map());
                const m = bo.get(type)!;
                m.set(ci.outcome, (m.get(ci.outcome) || 0) + 1);
              }
            });
          });
          let top: { t: string; o: string; c: number } | null = null;
          bo.forEach((outs, bt) => {
            let total = 0, ms = '', mc = 0;
            outs.forEach((c, s) => { total += c; if (c > mc) { mc = c; ms = s; } });
            const conf = total > 0 ? mc / total : 0;
            if (total >= 2 && conf >= 0.5 && (!top || conf > top.c)) top = { t: bt, o: ms, c: conf };
          });
          if (top) {
            const p = top as { t: string; o: string; c: number };
            observations.push(`On days following ${p.t.charAt(0).toUpperCase() + p.t.slice(1)} behaviors, you tend to check in ${p.o} ${Math.round(p.c * 100)}% of the time.`);
          }
        }

        // Time-of-day & day-of-week pattern observations (no calendar needed)
        if (checkIns.length >= 3 && observations.length < 2) {
          // Time-of-day pattern
          const twOutcomes: Record<string, Record<string, number>> = { morning: {}, afternoon: {}, evening: {} };
          const twTotals: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 };
          for (const ci of checkIns) {
            if (!ci.created_at || !ci.outcome) continue;
            const h = new Date(ci.created_at).getHours();
            const tw = h >= 5 && h <= 11 ? 'morning' : h >= 12 && h <= 17 ? 'afternoon' : 'evening';
            twOutcomes[tw][ci.outcome] = (twOutcomes[tw][ci.outcome] || 0) + 1;
            twTotals[tw]++;
          }
          // Find time window with strongest dominant state
          let bestTw: { window: string; state: string; pct: number } | null = null;
          for (const [tw, outs] of Object.entries(twOutcomes)) {
            if (twTotals[tw] < 2) continue;
            const sorted = Object.entries(outs).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
              const pct = sorted[0][1] / twTotals[tw];
              if (pct >= 0.6 && (!bestTw || pct > bestTw.pct)) {
                bestTw = { window: tw, state: sorted[0][0], pct };
              }
            }
          }
          if (bestTw && observations.length < 2) {
            const label = bestTw.window === 'morning' ? 'mornings' : bestTw.window === 'afternoon' ? 'afternoons' : 'evenings';
            observations.push(`You tend to check in ${bestTw.state} during ${label} — ${Math.round(bestTw.pct * 100)}% of the time.`);
          }

          // Day-of-week pattern
          if (observations.length < 2) {
            const dayLabelsArr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayScores: Record<string, number[]> = {};
            for (const ci of checkIns) {
              if (ci.energy_balance == null) continue;
              const d = dayLabelsArr[new Date(ci.checkin_date).getDay()];
              if (!dayScores[d]) dayScores[d] = [];
              dayScores[d].push(ci.energy_balance);
            }
            let bestDay: { day: string; avg: number } | null = null;
            let worstDay: { day: string; avg: number } | null = null;
            for (const [day, scores] of Object.entries(dayScores)) {
              if (scores.length < 2) continue;
              const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
              if (!bestDay || avg > bestDay.avg) bestDay = { day, avg: Math.round(avg) };
              if (!worstDay || avg < worstDay.avg) worstDay = { day, avg: Math.round(avg) };
            }
            if (bestDay && worstDay && bestDay.day !== worstDay.day) {
              observations.push(`Your readiness tends to peak on ${bestDay.day}s (avg ${bestDay.avg}) and dip on ${worstDay.day}s (avg ${worstDay.avg}).`);
            }
          }
        }

        setData({
          heatmap,
          bestWindow: bestScore > 0 ? `Your sharpest window this month has been ${bestLabel}.` : null,
          observations: observations.slice(0, 2),
          hasCalendar,
          checkInCount: checkIns.length,
        });
        setLoading(false);
        return;
      }

      // Production: call edge function
      const auth0Client = (window as any).__auth0Client;
      if (!auth0Client) {
        console.warn('[PerformanceRhythmCard] No auth0 client');
        setLoading(false);
        return;
      }
      const accessToken = await auth0Client.getAccessTokenSilently();
      const { data: result, error } = await supabase.functions.invoke('performance-rhythm-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!error && result) {
        setData(result as PerformanceRhythmData);
      }
    } catch (err) {
      console.error('[PerformanceRhythmCard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Progressive messages
  const getProgressiveMessage = () => {
    if (!data) return null;
    if (data.checkInCount === 0) return 'Complete your first check-in to start mapping your rhythm.';
    if (data.checkInCount < 5) return `${data.checkInCount} check-in${data.checkInCount > 1 ? 's' : ''} logged. Your rhythm becomes clearer with each one.`;
    return null;
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Performance Rhythm
          </span>
          <InsightInfoModal
            title="Your Performance Rhythm"
            explanation="When you perform, when you don't, and what your outer world is doing to your inner state. Your cognitive and emotional rhythm across the week — paired with a read on which calendar conditions consistently lift or drain your readiness."
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-6">Unable to load rhythm data.</p>
        ) : (
          <div className="space-y-5">
            {/* Dedicated Calendar Insights Box */}
            {data.observations.length > 0 ? (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary/70" />
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-primary/70 font-body">
                    Pattern Insights
                  </span>
                </div>
                <div className="space-y-2.5 pl-6">
                  {data.observations.map((obs, i) => (
                    <p key={i} className="text-sm text-foreground/85 leading-relaxed">
                      {obs}
                    </p>
                  ))}
                </div>
              </div>
            ) : data.checkInCount >= 5 && !data.hasCalendar ? (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Connect your calendar to see how your outer world affects your inner state.
                </p>
              </div>
            ) : null}

            {/* Progressive message */}
            {getProgressiveMessage() && (
              <p className="text-xs text-muted-foreground/70 text-center">
                {getProgressiveMessage()}
              </p>
            )}

            {/* 3x7 Heatmap Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[400px]">
                {/* Header row */}
                <div className="flex items-center mb-2">
                  <div className="w-20" />
                  {DAYS.map(day => (
                    <div key={day} className="flex-1 text-center text-xs text-muted-foreground font-medium">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Time rows */}
                {TIME_WINDOWS.map(tw => (
                  <div key={tw.key} className="flex items-center mb-2">
                    <div className="w-20 text-xs text-muted-foreground pr-3 text-right font-medium">
                      {tw.label}
                    </div>
                    {DAYS.map(day => {
                      const cell = data.heatmap[tw.key]?.[day];
                      const hasOutcome = cell && cell.outcome;
                      const style = hasOutcome ? stateColors[cell.outcome || ''] : null;

                      return (
                        <div key={`${tw.key}-${day}`} className="flex-1 px-0.5">
                          <div
                            className={cn(
                              'aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden',
                              hasOutcome
                                ? 'shadow-lg'
                                : 'bg-gradient-to-br from-muted/40 to-muted/20 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]',
                              cell?.divergence && 'ring-2 ring-amber-400/60 animate-pulse'
                            )}
                            style={hasOutcome && style ? {
                              boxShadow: `0 4px 12px ${style.glow}, inset 0 1px 2px rgba(255,255,255,0.2)`,
                            } : undefined}
                          >
                            {hasOutcome && style && (
                              <>
                                <div className={cn('absolute inset-0 bg-gradient-to-br', style.gradient)} />
                                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent" />
                                {/* Composite score overlay */}
                                {cell.avgScore !== null && (
                                  <span className="relative z-10 text-[10px] font-bold text-white/90 drop-shadow-sm">
                                    {cell.avgScore}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-1">
              {Object.entries(stateColors).map(([state, style]) => (
                <div key={state} className="flex items-center gap-1.5">
                  <div className={cn('w-3 h-3 rounded shadow-sm bg-gradient-to-br', style.gradient)} />
                  <span className="capitalize">{state}</span>
                </div>
              ))}
            </div>

            {/* Best Performance Window */}
            {data.bestWindow && (
              <p className="text-xs text-muted-foreground text-center font-medium">
                {data.bestWindow}
              </p>
            )}

            {/* Data source note */}
            {data.checkInCount > 0 && (
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Based on {data.checkInCount} check-in{data.checkInCount !== 1 ? 's' : ''} over the last 30 days
              </p>
            )}
          </div>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceRhythmCard;
