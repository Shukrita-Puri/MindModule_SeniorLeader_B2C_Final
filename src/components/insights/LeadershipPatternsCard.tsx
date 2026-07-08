import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface DimensionScores {
  recalibration: number;
  clarity: number;
  renewal: number;
}

export interface LeadershipPatternsData {
  aiObservation?: string | null;
  baselineArchetypeId?: string;
  baselineArchetypeTitle?: string;
  currentArchetypeId?: string | null;
  currentArchetypeTitle?: string | null;
  archetypeEvolved?: boolean;
  archetypeLeanOn?: string;
  archetypeWatchFor?: string;
  coreStrengths?: string[] | null;
  growthEdges?: string[] | null;
  baselineScores?: DimensionScores | null;
  currentScores?: DimensionScores | null;
  scoreDeltas?: DimensionScores | null;
  frictionPct?: number;
  frictionLabel?: string;
  /** Recent 7d minus prior 7d, in percentage points. Negative = friction decreased (good). Null when windows are empty. */
  frictionDeltaPct?: number | null;
  /** % of check-ins in the positive band (focused/steady) over 30d. Mirror of friction at the check-in level. Null until ≥5 check-ins. */
  positiveRate?: { pct: number; n: number } | null;
  /** Recent 7d minus prior 7d, in percentage points. Positive = alignment increased (good). Null when windows are empty. */
  positiveDeltaPct?: number | null;
  trendDirection?: 'improving' | 'stable' | 'declining';
  typicalState?: string | null;
  recurringThemes?: { phrase: string; count: number }[];
  coachStrength?: string | null;
  coachFriction?: string | null;
  checkInCount?: number;
  coachSessionCount?: number;
  hasWearable?: boolean;
  hasCalendar?: boolean;
  dataSourceNote?: string;
}

interface LeadershipPatternsCardProps {
  userId?: string;
  prefetchedData?: LeadershipPatternsData | null;
  /** When true, the card will wait for parent data instead of fetching on its own */
  parentLoading?: boolean;
}

const trendIcons = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
};

const trendColors = {
  improving: 'text-emerald-600',
  declining: 'text-red-500',
  stable: 'text-amber-500',
};

// DEV_MODE archetype resolution
function devResolveArchetype(er: number, fr: number, en: number) {
  if (er >= 65 && en >= 55) return { id: "grounded-leader", title: "The Grounded Master", leanOn: "Stability and presence – you lead from a centered place.", watchFor: "Over-reliance on composure when renewal is needed." };
  if (en >= 65 && er >= 50) return { id: "resilient-performer", title: "The Resilient Performer", leanOn: "Recovery capacity – you absorb impact and bounce back.", watchFor: "Pushing through when regulation would serve you better." };
  if (fr >= 65 && er >= 45) return { id: "clear-thinker", title: "The Clear Thinker", leanOn: "Mental clarity – you cut through complexity with precision.", watchFor: "Over-thinking when action or rest is what's needed." };
  if (er >= 60 && fr < 50) return { id: "intensity-driver", title: "The Intensity Driver", leanOn: "Directed force – you channel intensity into focused action.", watchFor: "Intensity without clarity can fragment your focus." };
  return { id: "adaptive-navigator", title: "The Adaptive Navigator", leanOn: "Flexibility – you read the field and adjust in real time.", watchFor: "Adapting constantly without anchoring can be depleting." };
}

const LeadershipPatternsCard = ({ userId, prefetchedData, parentLoading }: LeadershipPatternsCardProps) => {
  const [data, setData] = useState<LeadershipPatternsData | null>(null);
  const [loading, setLoading] = useState(true);
  // Performance Readiness Score from the Brief (inner_readiness_scores.composite_score)
  const [briefScore, setBriefScore] = useState<{ baseline: number | null; current: number | null }>({
    baseline: null,
    current: null,
  });

  useEffect(() => {
    // Use prefetched data if available (avoids duplicate edge function call)
    if (prefetchedData && prefetchedData.baselineArchetypeId) {
      setData(prefetchedData);
      setLoading(false);
      fetchBriefScore();
      return;
    }
    // If parent is still loading, wait – don't fire our own request
    if (parentLoading) return;
    // Only self-fetch if no parent is providing data (standalone usage)
    if (userId && prefetchedData === undefined) {
      fetchData();
      fetchBriefScore();
    }
    // If parent finished loading but data is empty/null, stop loading
    if (prefetchedData === null && !parentLoading) {
      setLoading(false);
      fetchBriefScore();
    }
  }, [userId, prefetchedData, parentLoading]);

  const fetchBriefScore = async () => {
    try {
      const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
      if (!effectiveUserId) return;
      // Source: brief_snapshots.score via the trusted `brief-history` Edge Function
      // (service-role read, scoped server-side by Auth0 sub). Avoids browser-side
      // PostgREST/RLS edge cases that previously caused this card to silently
      // fall back to "builds with your daily Brief" for valid users.
      let rows: Array<{ score: number | null; local_date: string; time_window: string | null; created_at: string }> = [];

      if (DEV_MODE) {
        const { data, error } = await supabase
          .from('brief_snapshots')
          .select('refined_score, baseline_score, local_date, time_window, created_at')
          .eq('user_id', effectiveUserId)
          .order('local_date', { ascending: false })
          .order('time_window', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(60);
        if (error) {
          console.warn('[LeadershipPatternsCard] DEV briefScore error:', error.message);
          return;
        }
        rows = (data ?? [])
          .map((r: any) => ({
            score: (r.refined_score ?? r.baseline_score) as number,
            local_date: r.local_date,
            time_window: r.time_window,
            created_at: r.created_at,
          }))
          .filter((r) => r.score != null);
      } else {
        const accessToken = await getAuthToken();
        if (!accessToken) return;
        // Sprint 1 (Phase 1): baseline / trend must come from delivered
        // briefs only. `supabase.functions.invoke` cannot send query
        // params, so we hit the function URL directly with ?delivered=1.
        const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
        const base = `https://${projectId}.supabase.co/functions/v1/brief-history`;
        const url = `${base}?limit=60&delivered=1`;
        let result: any = null;
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (!res.ok) {
            console.warn('[LeadershipPatternsCard] brief-history http error:', res.status);
            return;
          }
          result = await res.json();
        } catch (err) {
          console.warn('[LeadershipPatternsCard] brief-history fetch failed:', (err as Error)?.message);
          return;
        }
        rows = ((result?.briefs ?? []) as Array<any>)
          .filter((b) => b && b.score != null)
          .map((b) => ({
            score: b.score,
            local_date: b.local_date,
            time_window: b.time_window ?? null,
            created_at: b.created_at,
          }));
      }

      if (rows.length === 0) {
        setBriefScore({ baseline: null, current: null });
        return;
      }

      // Deterministic chronological order: local_date, then time_window, then created_at.
      const TW_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };
      const sorted = [...rows].sort((a, b) => {
        if (a.local_date !== b.local_date) return a.local_date < b.local_date ? -1 : 1;
        const at = TW_ORDER[a.time_window ?? ''] ?? 9;
        const bt = TW_ORDER[b.time_window ?? ''] ?? 9;
        if (at !== bt) return at - bt;
        return a.created_at < b.created_at ? -1 : 1;
      });

      const scores = sorted.map((r) => r.score as number);
      const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

      // Latest score is always shown when present (single-snapshot users get it).
      const latestScore = scores[scores.length - 1];

      // Evolution requires enough history: at least 2 baseline + 2 newer scores.
      let baseline: number | null = null;
      let current: number | null = null;
      if (scores.length >= 4) {
        const baselineWindow = scores.slice(0, Math.min(3, Math.floor(scores.length / 2)));
        const currentWindow = scores.slice(-Math.min(3, Math.floor(scores.length / 2)));
        baseline = mean(baselineWindow);
        current = mean(currentWindow);
      }

      setBriefScore({
        baseline: baseline != null ? Math.round(baseline) : (latestScore != null ? Math.round(latestScore) : null),
        current: current != null ? Math.round(current) : null,
      });
    } catch (err) {
      console.error('[LeadershipPatternsCard] briefScore fetch error:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (DEV_MODE) {
        const effectiveUserId = DEV_USER.id;
        const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        const fourteenDaysAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

        const [checkInsRes, themesRes, profileRes] = await Promise.all([
          supabase.from('daily_checkins').select('checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at').eq('user_id', effectiveUserId).gte('checkin_date', thirtyDaysAgo).order('checkin_date', { ascending: true }),
          supabase.from('daily_themes').select('theme_phrase, theme_driver').eq('user_id', effectiveUserId).gte('theme_date', thirtyDaysAgo),
          supabase.from('profiles').select('user_archetype, component_scores').eq('id', effectiveUserId).maybeSingle(),
        ]);

        const checkIns = checkInsRes.data || [];
        const themes = themesRes.data || [];
        const totalCheckins = checkIns.length;

        // Friction
        const lowStates = checkIns.filter((c) => ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')).length;
        const frictionPct = totalCheckins > 0 ? Math.round((lowStates / totalCheckins) * 100) : 0;
        const frictionLabel = frictionPct <= 25 ? 'Low friction' : frictionPct <= 50 ? 'Moderate friction' : frictionPct <= 75 ? 'High friction pattern' : 'Sustained friction';

        // Consistency = % of check-ins in positive band {focused, steady}. Null until ≥5.
        const POSITIVE_OUTCOMES = new Set(['focused', 'steady']);
        const positiveCount = checkIns.filter((c) => POSITIVE_OUTCOMES.has(c.outcome?.toLowerCase() || '')).length;
        const positiveRate = totalCheckins >= 5
          ? { pct: Math.round((positiveCount / totalCheckins) * 100), n: totalCheckins }
          : null;

        // Trend
        const recentCheckins = checkIns.filter((c) => c.checkin_date >= sevenDaysAgo);
        const priorCheckins = checkIns.filter((c) => c.checkin_date >= fourteenDaysAgo && c.checkin_date < sevenDaysAgo);
        let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
        let frictionDeltaPct: number | null = null;
        let positiveDeltaPctDev: number | null = null;
        if (recentCheckins.length > 0 && priorCheckins.length > 0) {
          const rFriction = recentCheckins.filter((c) => ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')).length / recentCheckins.length * 100;
          const pFriction = priorCheckins.filter((c) => ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')).length / priorCheckins.length * 100;
          const diff = pFriction - rFriction;
          if (diff >= 10) trendDirection = 'improving';
          else if (diff <= -10) trendDirection = 'declining';
          frictionDeltaPct = Math.round(rFriction - pFriction);
          const rPos = recentCheckins.filter((c) => ['focused', 'steady'].includes(c.outcome?.toLowerCase() || '')).length / recentCheckins.length * 100;
          const pPos = priorCheckins.filter((c) => ['focused', 'steady'].includes(c.outcome?.toLowerCase() || '')).length / priorCheckins.length * 100;
          positiveDeltaPctDev = Math.round(rPos - pPos);
        }

        // Recurring themes
        const themeCounts = new Map<string, number>();
        themes.forEach((t) => { if (t.theme_phrase) themeCounts.set(t.theme_phrase, (themeCounts.get(t.theme_phrase) || 0) + 1); });
        const recurringThemes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([phrase, count]) => ({ phrase, count }));

        // Archetype
        const cs = profileRes.data?.component_scores as any;
        const bER = cs?.energyRegulation ?? cs?.q2_energy_regulation ?? 50;
        const bFR = cs?.focusRecovery ?? cs?.q3_focus_recovery ?? 50;
        const bEN = cs?.energyRenewal ?? cs?.q4_energy_renewal ?? 50;
        const baselineArch = devResolveArchetype(bER, bFR, bEN);
        const baselineScores: DimensionScores = { recalibration: Math.round(bER), clarity: Math.round(bFR), renewal: Math.round(bEN) };

        // Current scores (simplified DEV_MODE: use felt states as proxy)
        const recentEB = recentCheckins.filter((c) => c.energy_balance != null).map((c) => c.energy_balance as number);
        const recentCL = recentCheckins.filter((c) => c.clarity_level != null).map((c) => c.clarity_level as number);
        const recentCF = recentCheckins.filter((c) => c.confidence_level != null).map((c) => c.confidence_level as number);

        let currentScores: DimensionScores | null = null;
        let currentArchetypeId: string | null = null;
        let currentArchetypeTitle: string | null = null;
        let archetypeEvolved = false;
        let scoreDeltas: DimensionScores | null = null;
        let currentLeanOn = baselineArch.leanOn;
        let currentWatchFor = baselineArch.watchFor;

        // Use available dimensions – fall back to clarity/confidence as proxy for energy if missing
        const hasEnoughData = totalCheckins >= 5 && (recentCL.length > 0 || recentCF.length > 0);
        if (hasEnoughData) {
          const avgER = recentEB.length > 0
            ? Math.round(recentEB.reduce((s, v) => s + v, 0) / recentEB.length)
            : Math.round((recentCL.reduce((s, v) => s + v, 0) / recentCL.length + recentCF.reduce((s, v) => s + v, 0) / recentCF.length) / 2);
          const avgFR = Math.round(recentCL.reduce((s, v) => s + v, 0) / recentCL.length);
          const avgEN = Math.round(recentCF.reduce((s, v) => s + v, 0) / recentCF.length);
          currentScores = { recalibration: avgER, clarity: avgFR, renewal: avgEN };
          const curArch = devResolveArchetype(avgER, avgFR, avgEN);
          currentArchetypeId = curArch.id;
          currentArchetypeTitle = curArch.title;
          currentLeanOn = curArch.leanOn;
          currentWatchFor = curArch.watchFor;
          scoreDeltas = {
            recalibration: avgER - baselineScores.recalibration,
            clarity: avgFR - baselineScores.clarity,
            renewal: avgEN - baselineScores.renewal,
          };
          archetypeEvolved = baselineArch.id !== curArch.id;
        }

        // Typical state
        const distribution: Record<string, number> = { focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0 };
        checkIns.forEach((c) => { const o = c.outcome?.toLowerCase(); if (o && o in distribution) distribution[o]++; });
        const sortedStates = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
        const typicalState = sortedStates[0]?.[1] > 0 ? sortedStates[0][0] : null;

        setData({
          aiObservation: totalCheckins >= 3 ? `Your readiness has been ${trendDirection} this period, with ${frictionLabel.toLowerCase()} across your check-ins.` : null,
          baselineArchetypeId: baselineArch.id,
          baselineArchetypeTitle: baselineArch.title,
          currentArchetypeId,
          currentArchetypeTitle,
          archetypeEvolved,
          archetypeLeanOn: currentLeanOn,
          archetypeWatchFor: currentWatchFor,
          baselineScores,
          currentScores,
          scoreDeltas,
          frictionPct,
          frictionLabel,
          frictionDeltaPct,
          positiveRate,
          positiveDeltaPct: positiveDeltaPctDev,
          trendDirection,
          typicalState,
          recurringThemes,
          coachStrength: null,
          coachFriction: null,
          checkInCount: totalCheckins,
          coachSessionCount: 0,
          hasWearable: false,
          hasCalendar: false,
          dataSourceNote: `Based on ${totalCheckins} check-in${totalCheckins !== 1 ? 's' : ''} over 30 days`,
        });
        setLoading(false);
        return;
      }

      // Production: edge function
      const accessToken = await getAuthToken();
      if (!accessToken) { setLoading(false); return; }
      const { data: result, error } = await supabase.functions.invoke('state-patterns-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!error && result?.data) {
        // Strip coach-derived fields client-side (mem://features/coach/suppression-standard)
        const raw = result.data as LeadershipPatternsData;
        setData({
          ...raw,
          coachStrength: null,
          coachFriction: null,
          coachSessionCount: 0,
        });
      }
    } catch (err) {
      console.error('[LeadershipPatternsCard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Per-row arrow direction. For metrics where higher = better (PRS, Alignment).
  const arrowFor = (delta: number | null | undefined) => {
    if (delta == null || Math.abs(delta) < 1) return { Icon: Minus, color: 'text-amber-500' };
    if (delta > 0) return { Icon: TrendingUp, color: 'text-emerald-600' };
    return { Icon: TrendingDown, color: 'text-red-500' };
  };
  // For Friction (lower = better): negative delta is good (down + green).
  const frictionArrowFor = (delta: number | null | undefined) => {
    if (delta == null || Math.abs(delta) < 1) return { Icon: Minus, color: 'text-amber-500' };
    if (delta < 0) return { Icon: TrendingDown, color: 'text-emerald-600' };
    return { Icon: TrendingUp, color: 'text-red-500' };
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Trajectory
          </span>
          <InsightInfoModal
            title="Your Trajectory"
            explanation="A scorecard view of how you’re evolving — your archetype, your Performance Readiness Score, and your friction pattern over the past month."
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-6">Unable to load your trajectory.</p>
        ) : (
          (() => {
            // Performance Readiness Score sourced from the Brief (inner_readiness_scores.composite_score)
            const baselineComposite = briefScore.baseline;
            const currentComposite = briefScore.current;
            const compositeDelta =
              baselineComposite != null && currentComposite != null
                ? currentComposite - baselineComposite
                : null;
            const scoreArrow = arrowFor(compositeDelta);
            const frictionArrow = frictionArrowFor(data.frictionDeltaPct);
            const alignmentArrow = arrowFor(data.positiveDeltaPct);
            return (
              <div className="space-y-4">

                {/* ── ROW 1: ARCHETYPE — only shown when an evolution has occurred ── */}
                {data.archetypeEvolved && data.baselineArchetypeTitle && data.currentArchetypeTitle && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium uppercase tracking-wider text-taupe shrink-0">
                      Archetype
                    </span>
                    <InsightInfoModal
                      title="How Scores Are Calculated"
                      explanation="Three dimensions that show how you’re showing up over time. Your baseline is set during onboarding and the current view evolves as you check in."
                    />
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="text-sm text-muted-foreground truncate">{data.baselineArchetypeTitle}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground truncate">{data.currentArchetypeTitle}</span>
                    </div>
                  </div>
                </div>
                )}

                {/* ── ROW 2: PERFORMANCE READINESS SCORE ── */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-taupe shrink-0">
                    Performance Readiness Score
                  </span>
                  <div className="flex items-center gap-2">
                    {currentComposite != null ? (
                      <>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{currentComposite}</span>
                        {compositeDelta != null && (
                          <span className={cn('text-sm font-semibold tabular-nums', scoreArrow.color)}>
                            ({compositeDelta > 0 ? '+' : ''}{compositeDelta})
                          </span>
                        )}
                        <scoreArrow.Icon className={cn('h-3.5 w-3.5', scoreArrow.color)} />
                      </>
                    ) : baselineComposite != null ? (
                      <>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{baselineComposite}</span>
                        <span className="text-xs text-muted-foreground italic">evolves with each Brief</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">building with your daily Briefs</span>
                    )}
                  </div>
                </div>

                {/* ── ROW 3: FRICTION ── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-medium uppercase tracking-wider text-taupe">
                      Friction
                    </span>
                    <InsightInfoModal
                      title="What Is Friction?"
                      explanation="How often you report difficult states — drained, overwhelmed, scattered — over the past month. It tells you whether friction is occasional or sustained."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {data.frictionPct}%
                    </span>
                    {data.frictionDeltaPct != null && (
                      <span className={cn('text-sm font-semibold tabular-nums', frictionArrow.color)}>
                        ({data.frictionDeltaPct > 0 ? '+' : ''}{data.frictionDeltaPct})
                      </span>
                    )}
                    <frictionArrow.Icon className={cn('h-3.5 w-3.5', frictionArrow.color)} />
                  </div>
                </div>

                {/* ── ROW 4: ALIGNMENT (mirror of Friction at check-in level) ── */}
                {data.positiveRate && (data.checkInCount ?? 0) >= 5 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-medium uppercase tracking-wider text-taupe">
                        Alignment
                      </span>
                      <InsightInfoModal
                        title="What Is Alignment?"
                        explanation="How often you’re checking in focused or steady over the past month — the unimpeded mirror of Friction. Higher means you’re moving through your days with less resistance."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {data.positiveRate.pct}%
                      </span>
                      {data.positiveDeltaPct != null && (
                        <span className={cn('text-sm font-semibold tabular-nums', alignmentArrow.color)}>
                          ({data.positiveDeltaPct > 0 ? '+' : ''}{data.positiveDeltaPct})
                        </span>
                      )}
                      <alignmentArrow.Icon className={cn('h-3.5 w-3.5', alignmentArrow.color)} />
                    </div>
                  </div>
                )}

                {/* Progressive messages */}
                {data.checkInCount === 0 && (
                  <p className="text-xs text-muted-foreground/70 text-center pt-2">
                    Complete your first check-in to start mapping your trajectory.
                  </p>
                )}
                {data.checkInCount > 0 && data.checkInCount < 5 && (
                  <p className="text-xs text-muted-foreground/70 text-center pt-2">
                    {data.checkInCount} check-in{data.checkInCount > 1 ? 's' : ''} logged. Your trajectory sharpens with each one.
                  </p>
                )}
              </div>
            );
          })()
        )}
      </CardContent>
    </LuxuryInsightCard>
  );
};

export default LeadershipPatternsCard;
