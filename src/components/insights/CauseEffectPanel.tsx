/**
 * Cause → Effect Panel
 * Unified ranked list of cause/effect statements drawn from three correlation sources:
 *   - Calendar events  → check-in state
 *   - Logged behaviors → check-in state
 *   - Completed practices → next-day improved state (uses PracticeEffectiveness data shape)
 *
 * Threshold (locked): confidence >= 0.5 AND occurrences >= 2.
 * Coach signals are deliberately NOT a source — see mem://features/coach/suppression-standard.
 */

import { useEffect, useState } from 'react';
import { Loader2, Calendar, Activity, Sparkles, ArrowRight } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { format, subDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

type SourceKind = 'Calendar' | 'Behavior' | 'Practice';

interface CauseEffectRow {
  source: SourceKind;
  cause: string;
  effect: string;
  occurrences: number;
  confidence: number; // 0..1
}

interface CauseEffectPanelProps {
  userId?: string;
}

const MIN_CONFIDENCE = 0.5;
const MIN_OCCURRENCES = 2;

const sourceMeta: Record<SourceKind, { icon: typeof Calendar; chip: string }> = {
  Calendar: { icon: Calendar, chip: 'bg-muted/40 text-muted-foreground border-border/40' },
  Behavior: { icon: Activity, chip: 'bg-muted/40 text-muted-foreground border-border/40' },
  Practice: { icon: Sparkles, chip: 'bg-muted/40 text-muted-foreground border-border/40' },
};

const stateBg: Record<string, string> = {
  focused: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  steady: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  scattered: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  drained: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  overwhelmed: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  improved: 'bg-saffron/10 text-saffron border-saffron/20',
};

const behaviorLabels: Record<string, string> = {
  avoided: 'Avoided',
  confronted: 'Confronted',
  listened: 'Listened',
  delayed: 'Delayed',
  delegated: 'Delegated',
  'over-controlled': 'Over-Controlled',
};

const calendarKeywords = [
  'board', 'quarterly', 'investor', 'pitch', 'review',
  'presentation', 'interview', 'deadline', 'client', 'all-hands',
  'performance', 'budget', 'strategy', 'executive', 'stakeholder',
];

const positiveStates = new Set(['focused', 'steady']);

const CauseEffectPanel = ({ userId }: CauseEffectPanelProps) => {
  const [rows, setRows] = useState<CauseEffectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAnyData, setHasAnyData] = useState(false);

  useEffect(() => {
    if (userId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchAll = async () => {
    setLoading(true);
    const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
    if (!effectiveUserId) { setLoading(false); return; }

    try {
      const thirtyDaysAgoStr = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const thirtyDaysAgoIso = new Date(thirtyDaysAgoStr).toISOString();

      const [checkInsRes, eventsRes, behaviorsRes, practicesRes, calConnRes] = await Promise.all([
        supabase.from('daily_checkins')
          .select('checkin_date, outcome, timestamp')
          .eq('user_id', effectiveUserId)
          .gte('checkin_date', thirtyDaysAgoStr),
        supabase.from('calendar_events')
          .select('title, start_time')
          .eq('user_id', effectiveUserId)
          .gte('start_time', thirtyDaysAgoIso),
        supabase.from('behavior_logs')
          .select('behavior_type, created_at')
          .eq('user_id', effectiveUserId)
          .gte('created_at', thirtyDaysAgoIso),
        supabase.from('sanctuary_events')
          .select('content_id, category, timestamp')
          .eq('user_id', effectiveUserId)
          .eq('event_type', 'completed')
          .gte('timestamp', thirtyDaysAgoIso),
        supabase.from('calendar_connections')
          .select('is_active')
          .eq('user_id', effectiveUserId)
          .eq('is_active', true)
          .maybeSingle(),
      ]);

      const checkIns = checkInsRes.data || [];
      const events = eventsRes.data || [];
      const behaviors = behaviorsRes.data || [];
      const practices = practicesRes.data || [];
      const hasCalendar = !!calConnRes.data?.is_active;

      setHasAnyData(checkIns.length > 0 || behaviors.length > 0 || practices.length > 0);

      const out: CauseEffectRow[] = [];

      // ── 1. Calendar Event Type → State ─────────────────────────────
      if (hasCalendar && events.length > 0 && checkIns.length >= 3) {
        const map = new Map<string, Map<string, number>>();
        checkIns.forEach((c) => {
          const day = new Date(c.checkin_date).toDateString();
          const outcome = c.outcome?.toLowerCase();
          if (!outcome) return;
          const dayEvents = events.filter((e) => new Date(e.start_time).toDateString() === day);
          dayEvents.forEach((ev) => {
            const title = (ev.title || '').toLowerCase();
            calendarKeywords.forEach((kw) => {
              if (title.includes(kw)) {
                if (!map.has(kw)) map.set(kw, new Map());
                const counts = map.get(kw)!;
                counts.set(outcome, (counts.get(outcome) || 0) + 1);
              }
            });
          });
        });
        map.forEach((counts, kw) => {
          let total = 0; let topState = ''; let topCount = 0;
          counts.forEach((c, s) => { total += c; if (c > topCount) { topCount = c; topState = s; } });
          const conf = total > 0 ? topCount / total : 0;
          if (total >= MIN_OCCURRENCES && conf >= MIN_CONFIDENCE) {
            out.push({
              source: 'Calendar',
              cause: `${kw.charAt(0).toUpperCase()}${kw.slice(1)} events`,
              effect: topState,
              occurrences: total,
              confidence: conf,
            });
          }
        });
      }

      // ── 2. Behavior → State (same/next day) ───────────────────────
      if (behaviors.length > 0 && checkIns.length > 0) {
        const map = new Map<string, Map<string, number>>();
        behaviors.forEach((b) => {
          const type = b.behavior_type?.toLowerCase();
          if (!type) return;
          const bDate = new Date(b.created_at);
          const relevant = checkIns.filter((c) => {
            const cDate = new Date(c.checkin_date);
            const diff = Math.floor((cDate.getTime() - bDate.getTime()) / 86400000);
            return diff >= 0 && diff <= 1;
          });
          relevant.forEach((c) => {
            const outcome = c.outcome?.toLowerCase();
            if (!outcome) return;
            if (!map.has(type)) map.set(type, new Map());
            const counts = map.get(type)!;
            counts.set(outcome, (counts.get(outcome) || 0) + 1);
          });
        });
        map.forEach((counts, type) => {
          let total = 0; let topState = ''; let topCount = 0;
          counts.forEach((c, s) => { total += c; if (c > topCount) { topCount = c; topState = s; } });
          const conf = total > 0 ? topCount / total : 0;
          if (total >= MIN_OCCURRENCES && conf >= MIN_CONFIDENCE) {
            out.push({
              source: 'Behavior',
              cause: behaviorLabels[type] || type.charAt(0).toUpperCase() + type.slice(1),
              effect: topState,
              occurrences: total,
              confidence: conf,
            });
          }
        });
      }

      // ── 3. Practice → next-day improved state ──────────────────────
      if (practices.length > 0 && checkIns.length >= 2) {
        // Resolve content titles for nicer labels
        const contentIds = [...new Set(practices.map((p) => p.content_id).filter(Boolean))] as string[];
        let contentMap = new Map<string, { title: string; category: string }>();
        if (contentIds.length > 0) {
          const { data: contentData } = await supabase
            .from('sanctuary_content')
            .select('id, title, category')
            .in('id', contentIds);
          contentMap = new Map((contentData || []).map((c: any) => [c.id, { title: c.title, category: c.category }]));
        }

        const perPractice = new Map<string, { used: number; improved: number; label: string }>();
        practices.forEach((p) => {
          const day = new Date(p.timestamp).toISOString().split('T')[0];
          const next = format(addDays(new Date(day), 1), 'yyyy-MM-dd');
          const nextCheckin = checkIns.find((c) => c.checkin_date === next);
          const meta = p.content_id ? contentMap.get(p.content_id) : null;
          const label = meta?.title || (p.category ? `${p.category.charAt(0).toUpperCase()}${p.category.slice(1)} practice` : 'Practice');
          const key = p.content_id || `cat:${p.category || 'unknown'}`;
          if (!perPractice.has(key)) perPractice.set(key, { used: 0, improved: 0, label });
          const entry = perPractice.get(key)!;
          entry.used++;
          const nextOutcome = nextCheckin?.outcome?.toLowerCase();
          if (nextOutcome && positiveStates.has(nextOutcome)) entry.improved++;
        });
        perPractice.forEach((e) => {
          const conf = e.used > 0 ? e.improved / e.used : 0;
          if (e.used >= MIN_OCCURRENCES && conf >= MIN_CONFIDENCE) {
            out.push({
              source: 'Practice',
              cause: e.label,
              effect: 'improved',
              occurrences: e.used,
              confidence: conf,
            });
          }
        });
      }

      // Rank: confidence desc, then occurrences desc; cap to 6
      out.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
      setRows(out.slice(0, 6));
    } catch (err) {
      console.error('[CauseEffectPanel] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Cause &amp; Effect
          </span>
          <InsightInfoModal
            title="Cause & Effect"
            explanation="Statistically observed patterns from your last 30 days: how calendar events, logged behaviors, and completed practices precede your reported state. Only patterns with at least 2 occurrences and 50% consistency are shown."
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-muted-foreground">
              {hasAnyData
                ? 'Not enough repeated patterns yet — keep checking in and logging.'
                : 'Patterns appear as your check-ins, behaviors, and practices accumulate.'}
            </p>
            <p className="text-xs text-muted-foreground/60">
              Threshold: 2+ occurrences, 50%+ consistency
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r, i) => {
              const Icon = sourceMeta[r.source].icon;
              return (
                <div
                  key={`${r.source}-${r.cause}-${i}`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/30"
                >
                  <Icon className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-foreground font-medium truncate">{r.cause}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium border capitalize',
                          stateBg[r.effect] || 'bg-muted text-muted-foreground border-border/40'
                        )}
                      >
                        {r.effect}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border',
                          sourceMeta[r.source].chip
                        )}
                      >
                        {r.source}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(r.confidence * 100)}% · {r.occurrences}×
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground/60 text-center pt-2">
              Based on last 30 days · ranked by consistency
            </p>
          </div>
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default CauseEffectPanel;