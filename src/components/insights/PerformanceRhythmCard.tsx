import { useEffect, useState } from 'react';
import { Loader2, Calendar, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface HeatmapCell {
  outcome: string | null;
  compositeScore: number | null;
  divergence: boolean;
}

interface BestReadinessWindow {
  timeWindow: number;
  day: number;
  avgScore: number;
  label: string;
}

interface PerformanceRhythmData {
  // New v2.0 fields
  presenceScore: number | null;
  presenceLabel: string | null;
  presenceInsight: string | null;
  presenceActions?: string[] | null;
  temporalPatterns?: string[] | null;
  calendarInsight: string | null;
  causeEffectInsight: string | null;
  grid: HeatmapCell[][];
  bestReadinessWindow: BestReadinessWindow | null;
  checkInCount: number;
  behaviorLogCount: number;
  hasCalendar: boolean;
  dataSourceNote: string;
  // Backward compat
  heatmap?: Record<string, Record<string, HeatmapCell>>;
  bestWindow?: string | null;
  observations?: string[];
}

interface PerformanceRhythmCardProps {
  userId?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_LABELS = ['Morning', 'Afternoon', 'Evening'];

const stateColors: Record<string, { gradient: string; glow: string }> = {
  focused: {
    gradient: 'from-green-800 to-yellow-500',
    glow: 'rgba(22, 101, 52, 0.4)',
  },
  steady: {
    gradient: 'from-amber-700 to-yellow-200',
    glow: 'rgba(180, 83, 9, 0.4)',
  },
  scattered: {
    gradient: 'from-teal-700 to-emerald-300',
    glow: 'rgba(15, 118, 110, 0.4)',
  },
  drained: {
    gradient: 'from-slate-700 to-gray-400',
    glow: 'rgba(51, 65, 85, 0.4)',
  },
  overwhelmed: {
    gradient: 'from-red-800 to-amber-600',
    glow: 'rgba(153, 27, 27, 0.4)',
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
        const effectiveUserId = DEV_USER.id;
        const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

        const [checkInsRes, calConnRes, calEventsRes, behaviorRes, readinessRes, ritualsRes, dialogueRes, jitRes, wearableRes] = await Promise.all([
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
          supabase
            .from('inner_readiness_scores')
            .select('composite_score, energy_tier, score_date, time_of_day')
            .eq('user_id', effectiveUserId)
            .gte('score_date', thirtyDaysAgo),
          supabase
            .from('daily_ritual_completions')
            .select('ritual_date, completion_status, session_period')
            .eq('user_id', effectiveUserId)
            .gte('ritual_date', thirtyDaysAgo),
          supabase
            .from('dialogue_sessions')
            .select('id')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('jit_preferences')
            .select('event_title, action, event_start_time')
            .eq('user_id', effectiveUserId)
            .gte('created_at', new Date(thirtyDaysAgo).toISOString()),
          supabase
            .from('wearable_data')
            .select('summary_date, hrv, resting_heart_rate')
            .eq('user_id', effectiveUserId)
            .gte('summary_date', thirtyDaysAgo)
            .not('hrv', 'is', null),
        ]);

        const checkIns = checkInsRes.data || [];
        const hasCalendar = !!calConnRes.data?.is_active;
        const calendarEvents = calEventsRes.data || [];
        const behaviorLogs = behaviorRes.data || [];
        const readinessScores = readinessRes.data || [];
        const rituals = ritualsRes.data || [];
        const jitPrefs = jitRes.data || [];
        const wearableData = wearableRes.data || [];

        // BUG 5 fix: Scope dialogue_messages by user's session IDs
        const userSessionIds = (dialogueRes.data || []).map((s: any) => s.id);
        let dialogueMessages: any[] = [];
        if (userSessionIds.length > 0) {
          const { data: msgs } = await supabase
            .from('dialogue_messages')
            .select('content, sender_type, session_id')
            .in('session_id', userSessionIds);
          dialogueMessages = msgs || [];
        }

        // Helper
        const isSameDay = (a: string, b: string) => a.split('T')[0] === b.split('T')[0];
        const getTimeWindow = (h: number) => h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : 2;
        const getDayIndex = (d: number) => d === 0 ? 6 : d - 1; // Sun=6, Mon=0

        // ── Build 3x7 grid ──
        const grid: HeatmapCell[][] = Array(3).fill(null).map(() => 
          Array(7).fill(null).map(() => ({ outcome: null, compositeScore: null, divergence: false }))
        );
        const cellLatest: number[][] = Array(3).fill(null).map(() => Array(7).fill(0));

        for (const ci of checkIns) {
          if (!ci.created_at || !ci.outcome) continue;
          const date = new Date(ci.created_at);
          const tw = getTimeWindow(date.getHours());
          const di = getDayIndex(date.getDay());
          const t = date.getTime();
          if (t > cellLatest[tw][di]) {
            cellLatest[tw][di] = t;
            grid[tw][di].outcome = ci.outcome;
          }
        }

        // Overlay composite scores (30-day avg per cell)
        const cellComposites: number[][][] = Array(3).fill(null).map(() => 
          Array(7).fill(null).map(() => [] as number[])
        );
        for (const s of readinessScores) {
          const date = new Date(s.score_date);
          // BUG 6 fix: Use time_of_day column instead of parsing hours from date-only score_date
          const tw = s.time_of_day === 'morning' ? 0 : s.time_of_day === 'afternoon' ? 1 : 2;
          const di = getDayIndex(date.getDay());
          cellComposites[tw][di].push(s.composite_score);
        }
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const scores = cellComposites[t][d];
            if (scores.length > 0) {
              grid[t][d].compositeScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            }
          }
        }

        // Divergence flags
        const outcomeExpected: Record<string, number> = { focused: 75, steady: 60, scattered: 45, drained: 30, overwhelmed: 25 };
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const cell = grid[t][d];
            if (cell.outcome && cell.compositeScore !== null) {
              const expected = outcomeExpected[cell.outcome] || 50;
              if (Math.abs(cell.compositeScore - expected) >= 20) {
                cell.divergence = true;
              }
            }
          }
        }

        // ── Best Readiness Window ──
        let bestReadinessWindow: BestReadinessWindow | null = null;
        for (let t = 0; t < 3; t++) {
          for (let d = 0; d < 7; d++) {
            const scores = cellComposites[t][d];
            if (scores.length >= 1) {
              const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
              if (!bestReadinessWindow || avg > bestReadinessWindow.avgScore) {
                bestReadinessWindow = {
                  timeWindow: t,
                  day: d,
                  avgScore: avg,
                  label: `${TIME_LABELS[t]} on ${DAYS[d]} (avg readiness: ${avg})`,
                };
              }
            }
          }
        }

        // ── Calendar Pattern (1B) ──
        let calendarInsight: string | null = null;
        if (hasCalendar && calendarEvents.length > 0 && checkIns.length >= 7) {
          const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
            board: ['board', 'board meeting', 'board of directors'],
            investor: ['investor', 'vc', 'funding', 'pitch'],
            quarterly: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'],
            strategic: ['strategy', 'strategic planning', 'offsite', 'roadmap'],
            client: ['client', 'customer', 'demo', 'proposal'],
            performance_review: ['performance review', 'annual review', 'mid-year'],
            all_hands: ['all hands', 'town hall', 'company meeting'],
            media: ['interview', 'podcast', 'media', 'press'],
            deadline: ['deadline', 'urgent', 'due', 'eod'],
            presentation: ['presentation', 'speaking', 'conference', 'webinar'],
          };
          const eventTypeCorrelations = new Map<string, { scores: number[]; count: number }>();
          for (const event of calendarEvents) {
            if (!event.title) continue;
            const tl = event.title.toLowerCase();
            const eventDate = new Date(event.start_time).toISOString().split('T')[0];
            const eventType = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
              EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
            );
            if (!eventType) continue;
            const dayScore = readinessScores.find(s => isSameDay(s.score_date, eventDate));
            if (!dayScore) continue;
            if (!eventTypeCorrelations.has(eventType)) eventTypeCorrelations.set(eventType, { scores: [], count: 0 });
            const d = eventTypeCorrelations.get(eventType)!;
            d.scores.push(dayScore.composite_score);
            d.count++;
          }
          const correlations: { eventType: string; avgScore: number; count: number }[] = [];
          eventTypeCorrelations.forEach((d, eventType) => {
            if (d.count >= 2) {
              correlations.push({ eventType, avgScore: d.scores.reduce((a, b) => a + b, 0) / d.count, count: d.count });
            }
          });
          correlations.sort((a, b) => a.avgScore - b.avgScore);
          const mostDraining = correlations[0];
          const mostEnergizing = correlations[correlations.length - 1];
          if (mostDraining && mostDraining.avgScore < 50) {
            calendarInsight = `On days with ${mostDraining.eventType.replace('_', ' ')} events, your readiness averages ${Math.round(mostDraining.avgScore)} — observed across ${mostDraining.count} occurrences.`;
          } else if (mostEnergizing && mostEnergizing.avgScore > 65) {
            calendarInsight = `${mostEnergizing.eventType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())} events consistently lift your readiness — avg ${Math.round(mostEnergizing.avgScore)} across ${mostEnergizing.count} occurrences.`;
          }
        }

        // ── Cause-Effect (1C) — All 6 paths mirroring edge function ──
        let causeEffectInsight: string | null = null;

        const EVENT_TYPE_KEYWORDS_CE: Record<string, string[]> = {
          board: ['board', 'board meeting', 'board of directors', 'board deck'],
          investor: ['investor', 'vc', 'funding', 'pitch', 'fundraise'],
          quarterly: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4', 'quarterly review'],
          strategic: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'],
          client: ['client', 'customer', 'demo', 'proposal'],
          performance_review: ['performance review', 'annual review', 'mid-year', '360'],
          all_hands: ['all hands', 'town hall', 'company meeting'],
          media: ['interview', 'podcast', 'media', 'press'],
          deadline: ['deadline', 'urgent', 'due', 'eod', 'cob'],
          presentation: ['presentation', 'speaking', 'conference', 'webinar'],
        };

        // Path A: Calendar Event Type × HRV Correlation
        if (hasCalendar && calendarEvents.length >= 3 && wearableData.length >= 5) {
          const allHRVs = wearableData.map((w: any) => w.hrv as number);
          const hrvBaseline = allHRVs.reduce((a: number, b: number) => a + b, 0) / allHRVs.length;
          const hrvByDate = new Map<string, number>();
          for (const w of wearableData) {
            hrvByDate.set(w.summary_date, w.hrv as number);
          }
          const eventTypeHRV = new Map<string, { hrvs: number[]; titles: string[] }>();
          for (const ev of calendarEvents) {
            if (!ev.title) continue;
            const tl = ev.title.toLowerCase();
            const et = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type =>
              EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl.includes(kw))
            );
            if (!et) continue;
            const evDate = new Date(ev.start_time).toISOString().split('T')[0];
            const dayHRV = hrvByDate.get(evDate);
            if (dayHRV === undefined) continue;
            if (!eventTypeHRV.has(et)) eventTypeHRV.set(et, { hrvs: [], titles: [] });
            const entry = eventTypeHRV.get(et)!;
            entry.hrvs.push(dayHRV);
            entry.titles.push(ev.title);
          }
          let bestDeviation: { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string } | null = null;
          eventTypeHRV.forEach((data, et) => {
            if (data.hrvs.length < 2) return;
            const avgHRV = data.hrvs.reduce((a, b) => a + b, 0) / data.hrvs.length;
            const devPct = ((avgHRV - hrvBaseline) / hrvBaseline) * 100;
            if (Math.abs(devPct) >= 10) {
              if (!bestDeviation || Math.abs(devPct) > Math.abs(bestDeviation.devPct)) {
                bestDeviation = { et, avgHRV: Math.round(avgHRV), count: data.hrvs.length, devPct: Math.round(devPct), recentTitle: data.titles[data.titles.length - 1], direction: devPct < 0 ? 'drop' : 'rise' };
              }
            }
          });
          if (bestDeviation) {
            const b = bestDeviation as { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string };
            const label = b.et.replace(/_/g, ' ');
            const absDevPct = Math.abs(b.devPct);
            causeEffectInsight = b.direction === 'drop'
              ? `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV drop (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) — observed across ${b.count} events.`
              : `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV rise (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) — these events don't tax your nervous system.`;
          }
        }

        // Path B: behavior_logs → nearest same/next-day check-in
        if (!causeEffectInsight && behaviorLogs.length >= 2 && checkIns.length > 0) {
          const bp = new Map<string, { behavior: string; outcome: string; count: number }>();
          for (const log of behaviorLogs) {
            const bd = new Date(log.created_at).toISOString().split('T')[0];
            const type = log.behavior_type?.toLowerCase();
            if (!type) continue;
            let nearest: typeof checkIns[0] | null = null;
            let nearestDiff = Infinity;
            for (const ci of checkIns) {
              const diff = (new Date(ci.checkin_date).getTime() - new Date(bd).getTime()) / 86400000;
              if (diff >= 0 && diff <= 1 && Math.abs(diff) < nearestDiff && ci.outcome) {
                nearest = ci;
                nearestDiff = Math.abs(diff);
              }
            }
            if (nearest) {
              const key = `${type}→${nearest.outcome}`;
              if (!bp.has(key)) bp.set(key, { behavior: type, outcome: nearest.outcome!, count: 0 });
              bp.get(key)!.count++;
            }
          }
          const totals = new Map<string, number>();
          bp.forEach(p => totals.set(p.behavior, (totals.get(p.behavior) || 0) + p.count));
          const patterns: { behavior: string; outcome: string; conf: number; count: number }[] = [];
          bp.forEach(p => {
            const t = totals.get(p.behavior) || 1;
            const conf = p.count / t;
            if (p.count >= 2 && conf >= 0.4) patterns.push({ behavior: p.behavior, outcome: p.outcome, conf, count: p.count });
          });
          patterns.sort((a, b) => b.conf - a.conf);
          if (patterns[0]) {
            const p = patterns[0];
            const behaviorLabel = p.behavior.replace(/_/g, ' ');
            causeEffectInsight = `On days following ${behaviorLabel.charAt(0).toUpperCase() + behaviorLabel.slice(1)}, you tend to check in '${p.outcome}' ${Math.round(p.conf * 100)}% of the time.`;
          }
        }

        // Path C: Calendar event → next-day check-in outcome
        if (!causeEffectInsight && hasCalendar && calendarEvents.length >= 3 && checkIns.length >= 5) {
          const etOutcomes = new Map<string, string[]>();
          for (const ev of calendarEvents) {
            if (!ev.title) continue;
            const tl = ev.title.toLowerCase();
            let et = Object.keys(EVENT_TYPE_KEYWORDS_CE).find(type =>
              EVENT_TYPE_KEYWORDS_CE[type].some(kw => tl.includes(kw))
            );
            if (!et) et = 'calendar_event';
            const evDate = new Date(ev.start_time).toISOString().split('T')[0];
            const nextDate = new Date(new Date(ev.start_time).getTime() + 86400000).toISOString().split('T')[0];
            const sameDayCI = checkIns.find(c => c.checkin_date === evDate);
            const nextDayCI = checkIns.find(c => c.checkin_date === nextDate);
            const matchCI = nextDayCI || sameDayCI;
            if (matchCI?.outcome) {
              if (!etOutcomes.has(et)) etOutcomes.set(et, []);
              etOutcomes.get(et)!.push(matchCI.outcome);
            }
          }
          let bestCalCE: { et: string; outcome: string; pct: number; count: number } | null = null;
          etOutcomes.forEach((outcomes, et) => {
            if (outcomes.length < 2) return;
            const freq = new Map<string, number>();
            outcomes.forEach(o => freq.set(o, (freq.get(o) || 0) + 1));
            freq.forEach((cnt, outcome) => {
              const pct = cnt / outcomes.length;
              if (pct >= 0.4 && (!bestCalCE || pct > bestCalCE.pct)) {
                bestCalCE = { et, outcome, pct, count: outcomes.length };
              }
            });
          });
          if (bestCalCE) {
            const b = bestCalCE as { et: string; outcome: string; pct: number; count: number };
            const label = b.et === 'calendar_event' ? 'busy calendar days' : `${b.et.replace('_', ' ')} events`;
            causeEffectInsight = `After ${label}, you tend to check in '${b.outcome}' — ${Math.round(b.pct * 100)}% of the time across ${b.count} occurrences.`;
          }
        }

        // Path D: Event day vs non-event day
        if (!causeEffectInsight && hasCalendar && calendarEvents.length >= 2 && checkIns.length >= 5) {
          const eventDayOutcomes: string[] = [];
          const nonEventDayOutcomes: string[] = [];
          const eventDates = new Set(calendarEvents.map(e => new Date(e.start_time).toISOString().split('T')[0]));
          for (const ci of checkIns) {
            if (!ci.outcome) continue;
            if (eventDates.has(ci.checkin_date)) eventDayOutcomes.push(ci.outcome);
            else nonEventDayOutcomes.push(ci.outcome);
          }
          if (eventDayOutcomes.length >= 3 && nonEventDayOutcomes.length >= 2) {
            const posOutcomes = new Set(['focused', 'steady']);
            const eventPosPct = eventDayOutcomes.filter(o => posOutcomes.has(o)).length / eventDayOutcomes.length;
            const nonEventPosPct = nonEventDayOutcomes.filter(o => posOutcomes.has(o)).length / nonEventDayOutcomes.length;
            const diff = eventPosPct - nonEventPosPct;
            if (Math.abs(diff) >= 0.15) {
              causeEffectInsight = diff > 0
                ? `On days with calendar events, you check in positively ${Math.round(eventPosPct * 100)}% of the time vs ${Math.round(nonEventPosPct * 100)}% on quieter days — external structure may help you focus.`
                : `On quieter days without events, you check in positively ${Math.round(nonEventPosPct * 100)}% of the time vs ${Math.round(eventPosPct * 100)}% on event-heavy days — your inner state may benefit from space.`;
            }
          }
        }

        // Path E: JIT completion → outcome + HRV enrichment
        if (!causeEffectInsight && jitPrefs.length >= 2 && checkIns.length >= 5) {
          const jitCompleted = jitPrefs.filter((j: any) => j.action === 'completed' || j.action === 'accepted');
          if (jitCompleted.length >= 2) {
            if (wearableData.length >= 3) {
              const hrvByDate = new Map<string, number>();
              for (const w of wearableData) {
                hrvByDate.set(w.summary_date, w.hrv as number);
              }
              const jitDayHRVs: number[] = [];
              const allEventDates = new Set<string>();
              for (const j of jitCompleted) {
                if (!j.event_start_time) continue;
                const evDate = new Date(j.event_start_time).toISOString().split('T')[0];
                allEventDates.add(evDate);
                const hrv = hrvByDate.get(evDate);
                if (hrv !== undefined) jitDayHRVs.push(hrv);
              }
              const nonPreppedHRVs: number[] = [];
              for (const ev of calendarEvents) {
                const evDate = new Date(ev.start_time).toISOString().split('T')[0];
                if (allEventDates.has(evDate)) continue;
                const hrv = hrvByDate.get(evDate);
                if (hrv !== undefined) nonPreppedHRVs.push(hrv);
              }
              if (jitDayHRVs.length >= 2 && nonPreppedHRVs.length >= 2) {
                const jitAvg = Math.round(jitDayHRVs.reduce((a, b) => a + b, 0) / jitDayHRVs.length);
                const nonAvg = Math.round(nonPreppedHRVs.reduce((a, b) => a + b, 0) / nonPreppedHRVs.length);
                causeEffectInsight = jitAvg > nonAvg
                  ? `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped event days — preparation may reduce physiological stress.`
                  : `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped days — prep helps your state even when HRV stays similar.`;
              }
            }
            if (!causeEffectInsight) {
              const completedOutcomes: string[] = [];
              for (const j of jitCompleted) {
                if (!j.event_start_time) continue;
                const evDate = new Date(j.event_start_time).toISOString().split('T')[0];
                const ci = checkIns.find(c => c.checkin_date === evDate);
                if (ci?.outcome) completedOutcomes.push(ci.outcome);
              }
              const positiveCount = completedOutcomes.filter(o => o === 'focused' || o === 'steady').length;
              if (completedOutcomes.length >= 2 && positiveCount / completedOutcomes.length >= 0.5) {
                causeEffectInsight = `When you completed JIT prep before events, you checked in positively ${Math.round(positiveCount / completedOutcomes.length * 100)}% of the time — observed across ${completedOutcomes.length} events.`;
              }
            }
          }
        }

        // Path F: Temporal fallback (weekday/weekend, morning/evening)
        if (!causeEffectInsight && checkIns.length >= 7) {
          const positiveOutcomes = new Set(['focused', 'steady']);
          const weekdayCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return d >= 1 && d <= 5 && c.outcome; });
          const weekendCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return (d === 0 || d === 6) && c.outcome; });
          if (weekdayCI.length >= 3 && weekendCI.length >= 2) {
            const wdPos = weekdayCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekdayCI.length;
            const wePos = weekendCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekendCI.length;
            if (Math.abs(wdPos - wePos) >= 0.15) {
              const better = wdPos > wePos ? 'weekdays' : 'weekends';
              const worse = wdPos > wePos ? 'weekends' : 'weekdays';
              const betterPct = Math.round(Math.max(wdPos, wePos) * 100);
              const worsePct = Math.round(Math.min(wdPos, wePos) * 100);
              causeEffectInsight = `Your positive check-in rate on ${better} is ${betterPct}% vs ${worsePct}% on ${worse} — your environment on ${better} may better support your inner state.`;
            }
          }
          if (!causeEffectInsight) {
            const morningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 5 && h < 12 && c.outcome; });
            const eveningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 17 && c.outcome; });
            if (morningCI.length >= 3 && eveningCI.length >= 3) {
              const mPos = morningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / morningCI.length;
              const ePos = eveningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / eveningCI.length;
              if (Math.abs(mPos - ePos) >= 0.15) {
                const better = mPos > ePos ? 'mornings' : 'evenings';
                const betterPct = Math.round(Math.max(mPos, ePos) * 100);
                causeEffectInsight = `You tend to check in more positively during ${better} (${betterPct}% positive) — your natural rhythm may favour this window for high-stakes work.`;
              }
            }
          }
        }

        // ── How You Show Up (1A) ──
        let presenceScore: number | null = null;
        let presenceLabel: string | null = null;
        let presenceInsight: string | null = null;

        const HIGH_STAKES_KEYWORDS = [
          'board', 'board meeting', 'board of directors', 'investor', 'vc', 'funding', 'pitch',
          'crisis', 'urgent', 'emergency', 'negotiation', 'deal', 'contract',
          'all hands', 'town hall', 'company meeting', 'interview', 'media', 'press',
          'performance review', 'annual review', 'termination', 'layoff', 'difficult conversation',
          'quarterly', 'qbr', 'earnings', 'product launch', 'go live',
          'keynote', 'conference', 'speaking', 'presentation',
        ];
        const highStakesEvents = calendarEvents.filter(e =>
          e.title && HIGH_STAKES_KEYWORDS.some(k => e.title!.toLowerCase().includes(k))
        );
        const coachSessionCount = dialogueMessages.filter(m => m.sender_type === 'coach').length > 0 ? 
          new Set(dialogueMessages.filter(m => m.sender_type === 'coach').map(m => m.session_id)).size : 0;

        if (checkIns.length >= 7 && (highStakesEvents.length >= 1 || coachSessionCount >= 2)) {
          // Pre-event sessions
          const preEventSessionsCompleted = rituals.filter(r =>
            r.session_period === 'pre-event' && r.completion_status === 'full' &&
            highStakesEvents.some(e => isSameDay(new Date(e.start_time).toISOString(), r.ritual_date))
          ).length;
          const preEventScore = Math.min(30, preEventSessionsCompleted * 10);

          // High-stakes on depleted days
          const lowReadinessHighStakes = highStakesEvents.filter(e => {
            const dayScore = readinessScores.find(s => isSameDay(s.score_date, new Date(e.start_time).toISOString().split('T')[0]));
            return dayScore && dayScore.energy_tier === 'depleted';
          }).length;
          const lowReadinessScore = Math.min(20, lowReadinessHighStakes * 5);

          // Coach presence keywords
          const positiveKw = /showed up well|brought full presence|held the room|commanded the space|fully there|present and sharp|brought your best/i;
          const negativeKw = /wasn't fully there|didn't bring it|phoned it in|checked out|not fully present|energy wasn't there/i;
          const positivePresence = dialogueMessages.filter(m => positiveKw.test(m.content)).length;
          const negativePresence = dialogueMessages.filter(m => negativeKw.test(m.content)).length;
          const coachPresenceScore = Math.max(-30, Math.min(30, (positivePresence * 15) - (negativePresence * 15)));

          // Energized after high-stakes
          const energizedAfterHighStakes = highStakesEvents.filter(e => {
            const eventDateStr = new Date(e.start_time).toISOString().split('T')[0];
            const nextDateStr = format(new Date(new Date(e.start_time).getTime() + 86400000), 'yyyy-MM-dd');
            const eventDayScore = readinessScores.find(s => s.score_date === eventDateStr);
            const nextDayScore = readinessScores.find(s => s.score_date === nextDateStr);
            return eventDayScore && nextDayScore && (nextDayScore.composite_score > eventDayScore.composite_score + 10);
          }).length;
          const energizedScore = Math.min(15, energizedAfterHighStakes * 5);

          presenceScore = Math.max(0, Math.min(100, preEventScore + lowReadinessScore + coachPresenceScore + energizedScore));

          if (presenceScore >= 70) presenceLabel = 'You show up when it matters';
          else if (presenceScore >= 50) presenceLabel = 'Your presence holds under pressure';
          else if (presenceScore >= 30) presenceLabel = 'Your presence varies with your state';
          else presenceLabel = 'State is affecting your presence';

          // Dominant signal insight
          const signals = [
            { score: preEventScore, text: `You prepared for ${preEventSessionsCompleted} of ${highStakesEvents.length} high-stakes moments — your presence held even when readiness was low.` },
            { score: Math.abs(coachPresenceScore), text: coachPresenceScore > 0 ? 'Your coach has noted strong presence in high-stakes contexts — that consistency is a real strength.' : 'Your coach has flagged uneven presence when stakes are high — preparation matters but doesn\'t always close the gap.' },
            { score: lowReadinessScore, text: `You showed up to ${lowReadinessHighStakes} high-stakes moments while depleted — your presence held despite your state.` },
            { score: energizedScore, text: 'High-stakes moments energize you — your readiness often rises the day after, not before.' },
          ];
          signals.sort((a, b) => b.score - a.score);
          presenceInsight = signals[0].score > 0 ? signals[0].text : 'Building pattern data — presence insights strengthen after more high-stakes moments.';
        }

        // ── Data Source Note ──
        const daySpan = checkIns.length > 0
          ? Math.ceil((new Date().getTime() - new Date(checkIns[checkIns.length - 1].checkin_date).getTime()) / 86400000)
          : 0;
        let dataSourceNote = `Based on ${checkIns.length} check-in${checkIns.length !== 1 ? 's' : ''}`;
        if (behaviorLogs.length > 0) dataSourceNote += `, ${behaviorLogs.length} behavior log${behaviorLogs.length !== 1 ? 's' : ''}`;
        if (hasCalendar) dataSourceNote += ', calendar data';
        if (wearableData.length > 0) dataSourceNote += `, ${wearableData.length} HRV reading${wearableData.length !== 1 ? 's' : ''}`;
        dataSourceNote += ` over ${daySpan} days`;

        setData({
          presenceScore,
          presenceLabel,
          presenceInsight,
          calendarInsight,
          causeEffectInsight,
          grid,
          bestReadinessWindow: bestReadinessWindow,
          checkInCount: checkIns.length,
          behaviorLogCount: behaviorLogs.length,
          hasCalendar,
          dataSourceNote,
        });
        setLoading(false);
        return;
      }

      // Production: call edge function
      const accessToken = await getAuthToken();
      if (!accessToken) {
        console.warn('[PerformanceRhythmCard] No auth token available');
        setLoading(false);
        return;
      }
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

  const getProgressiveMessage = () => {
    if (!data) return null;
    if (data.checkInCount === 0) return 'Complete your first check-in to start mapping your rhythm.';
    if (data.checkInCount < 5) return `${data.checkInCount} check-in${data.checkInCount > 1 ? 's' : ''} logged — ${5 - data.checkInCount} more to see your readiness rhythm.`;
    return null;
  };

  const getInsightUnlockMessages = () => {
    if (!data || data.checkInCount < 5) return [];
    const messages: { icon: 'sparkles' | 'calendar' | 'target'; text: string }[] = [];

    if (data.checkInCount < 7) {
      messages.push({
        icon: 'target',
        text: `${7 - data.checkInCount} more check-in${7 - data.checkInCount > 1 ? 's' : ''} to unlock calendar, cause-effect & presence insights`,
      });
    } else {
      if (!data.calendarInsight && !data.causeEffectInsight) {
        if (!data.hasCalendar) {
          messages.push({ icon: 'calendar', text: 'Connect your calendar to reveal how events affect your readiness' });
        }
        if (data.behaviorLogCount < 3) {
          messages.push({ icon: 'target', text: `Log ${3 - data.behaviorLogCount} more behavior${3 - data.behaviorLogCount > 1 ? 's' : ''} to see cause-effect patterns` });
        }
      }
      if (!data.presenceLabel) {
        messages.push({ icon: 'sparkles', text: 'Keep checking in — presence insights appear after more high-stakes moments or coach sessions' });
      }
    }

    return messages;
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Readiness Rhythm
          </span>
          <InsightInfoModal
            title="Your Readiness Rhythm"
            explanation="When you're at your sharpest and what your outer world is doing to your inner state. This card connects your inner readiness with outer circumstances — calendar events, time of day, behaviors — to surface patterns you can't see without the aggregation."
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
            {/* Progressive message */}
            {getProgressiveMessage() && (
              <p className="text-xs text-muted-foreground/70 text-center">
                {getProgressiveMessage()}
              </p>
            )}

            {/* 1A — How You Show Up (15+ check-ins) */}
            {data.checkInCount >= 7 && data.presenceLabel && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary/70" />
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-primary/70 font-body">
                    How You Show Up
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground pl-6">{data.presenceLabel}</p>
                {data.presenceInsight && (
                  <p className="text-sm text-foreground/80 leading-relaxed pl-6">{data.presenceInsight}</p>
                )}
                {/* Combined: presence actions + temporal patterns */}
                {(data.presenceActions?.length || data.temporalPatterns?.length) ? (
                  <ul className="pl-6 space-y-1.5 mt-1">
                    {data.presenceActions?.map((action, i) => (
                      <li key={`a-${i}`} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 text-primary/50 flex-shrink-0 mt-0.5" />
                        <span>{action}</span>
                      </li>
                    ))}
                    {data.temporalPatterns?.map((pattern, i) => (
                      <li key={`t-${i}`} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 text-primary/40 flex-shrink-0 mt-0.5" />
                        <span>{pattern}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

            {/* 1B — Calendar Pattern (10+ check-ins) */}
            {data.checkInCount >= 7 && data.calendarInsight && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary/70" />
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-primary/70 font-body">
                    Calendar Pattern
                  </span>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed pl-6">{data.calendarInsight}</p>
              </div>
            )}

            {/* 1C — Cause-Effect (10+ check-ins) */}
            {data.checkInCount >= 7 && data.causeEffectInsight && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2">
                <p className="text-sm text-foreground/85 leading-relaxed">{data.causeEffectInsight}</p>
              </div>
            )}

            {/* Insight unlock incentives */}
            {getInsightUnlockMessages().length > 0 && !data.presenceLabel && !data.calendarInsight && !data.causeEffectInsight && (
              <div className="space-y-2">
                {getInsightUnlockMessages().map((msg, i) => (
                  <div key={i} className="p-3 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 flex items-center gap-3">
                    {msg.icon === 'sparkles' && <Sparkles className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    {msg.icon === 'calendar' && <Calendar className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    {msg.icon === 'target' && <Sparkles className="h-4 w-4 text-primary/50 flex-shrink-0" />}
                    <p className="text-xs text-muted-foreground leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>
            )}
            {data.checkInCount >= 7 && !data.hasCalendar && !data.calendarInsight && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/30 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Connect your calendar to see how your outer world affects your inner state.
                </p>
              </div>
            )}

            {/* 2 — Heatmap (7+ check-ins) */}
            {data.checkInCount >= 5 && data.grid && (
              <>
                <div>
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground font-body mb-3 block">
                    Your Week at a Glance
                  </span>
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
                      {TIME_LABELS.map((label, twIdx) => (
                        <div key={label} className="flex items-center mb-2">
                          <div className="w-20 text-xs text-muted-foreground pr-3 text-right font-medium">
                            {label}
                          </div>
                          {DAYS.map((day, dayIdx) => {
                            const cell = data.grid[twIdx]?.[dayIdx];
                            const hasOutcome = cell && cell.outcome;
                            const style = hasOutcome ? stateColors[cell.outcome || ''] : null;

                            return (
                              <div key={`${twIdx}-${dayIdx}`} className="flex-1 px-0.5">
                                <div
                                  className={cn(
                                    'aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden',
                                    hasOutcome
                                      ? 'shadow-lg'
                                      : 'bg-gradient-to-br from-muted/40 to-muted/20 border border-white/5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]',
                                    cell?.divergence && 'ring-2 ring-amber-400/60'
                                  )}
                                  style={hasOutcome && style ? {
                                    boxShadow: `0 4px 12px ${style.glow}, inset 0 1px 2px rgba(255,255,255,0.2)`,
                                  } : undefined}
                                >
                                  {hasOutcome && style && (
                                    <>
                                      <div className={cn('absolute inset-0 bg-gradient-to-br', style.gradient)} />
                                      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent" />
                                      {cell.compositeScore !== null && (
                                        <span className="relative z-10 text-[10px] font-bold text-white/90 drop-shadow-sm flex items-center gap-0.5">
                                          {cell.compositeScore}
                                          {cell.divergence && <AlertTriangle className="w-2.5 h-2.5 text-amber-200" />}
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
              </>
            )}

            {/* 3 — Best Readiness Window */}
            {data.bestReadinessWindow && (
              <p className="text-xs text-muted-foreground text-center font-medium">
                Your sharpest window: {data.bestReadinessWindow.label}
              </p>
            )}

            {/* 4 — Data Source Note */}
            {data.checkInCount > 0 && (
              <p className="text-[10px] text-muted-foreground/60 text-center">
                {data.dataSourceNote}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default PerformanceRhythmCard;
