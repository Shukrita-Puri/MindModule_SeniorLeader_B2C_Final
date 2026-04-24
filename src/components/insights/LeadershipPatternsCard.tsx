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
      // Baseline = earliest composite_score, Current = latest composite_score
      const [earliestRes, latestRes] = await Promise.all([
        supabase
          .from('inner_readiness_scores')
          .select('composite_score, score_date')
          .eq('user_id', effectiveUserId)
          .order('score_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('inner_readiness_scores')
          .select('composite_score, score_date')
          .eq('user_id', effectiveUserId)
          .order('score_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const baseline = earliestRes.data?.composite_score ?? null;
      const latest = latestRes.data?.composite_score ?? null;
      setBriefScore({
        baseline: baseline != null ? Math.round(baseline) : null,
        // If only one score exists (baseline === latest by date), don't show "current"
        current:
          latest != null && earliestRes.data?.score_date !== latestRes.data?.score_date
            ? Math.round(latest)
            : null,
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

        // Trend
        const recentCheckins = checkIns.filter((c) => c.checkin_date >= sevenDaysAgo);
        const priorCheckins = checkIns.filter((c) => c.checkin_date >= fourteenDaysAgo && c.checkin_date < sevenDaysAgo);
        let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
        if (recentCheckins.length > 0 && priorCheckins.length > 0) {
          const rFriction = recentCheckins.filter((c) => ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')).length / recentCheckins.length * 100;
          const pFriction = priorCheckins.filter((c) => ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')).length / priorCheckins.length * 100;
          const diff = pFriction - rFriction;
          if (diff >= 10) trendDirection = 'improving';
          else if (diff <= -10) trendDirection = 'declining';
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

  // Color helper: positive=green, negative=red, stable=yellow (text only)
  const deltaTone = (delta: number): string => {
    if (delta > 0) return 'text-emerald-600';
    if (delta < 0) return 'text-red-500';
    return 'text-amber-500';
  };

  // Friction tone — lower friction is positive (green), higher is negative (red), middle = yellow
  const frictionTone = (pct: number): string => {
    if (pct <= 25) return 'text-emerald-600';
    if (pct <= 50) return 'text-amber-500';
    return 'text-red-500';
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
            explanation="A scorecard view of how you're evolving — your archetype, your composite Performance Readiness Score, and your friction pattern. Drawn from your check-ins and practice data over 30 days."
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
            const ScoreTrendIcon = trendIcons[data.trendDirection];
            const FrictionTrendIcon = trendIcons[data.trendDirection];
            return (
              <div className="space-y-4">

                {/* ── ROW 1: ARCHETYPE (with tooltip on right) ── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground shrink-0">
                      Archetype
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {data.archetypeEvolved && data.baselineArchetypeTitle && data.currentArchetypeTitle ? (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="text-sm text-muted-foreground truncate">{data.baselineArchetypeTitle}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground truncate">{data.currentArchetypeTitle}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-foreground truncate text-right">
                        {data.currentArchetypeTitle || data.baselineArchetypeTitle}
                      </span>
                    )}
                    <InsightInfoModal
                      title="How Scores Are Calculated"
                      explanation="These three scores reflect how you show up over time – drawn from your check-ins and practice data. Each dimension is scored 0–100. Your baseline was set during onboarding; the current score updates as you check in."
                    />
                  </div>
                </div>

                {/* ── ROW 2: PERFORMANCE READINESS SCORE ── */}
                {baselineComposite != null && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground shrink-0">
                      Performance Readiness Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground tabular-nums">{baselineComposite}</span>
                      {currentComposite != null ? (
                        <>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-semibold text-foreground tabular-nums">{currentComposite}</span>
                          {compositeDelta != null && (
                            <span className={cn('text-sm font-semibold tabular-nums', deltaTone(compositeDelta))}>
                              ({compositeDelta > 0 ? '+' : ''}{compositeDelta})
                            </span>
                          )}
                          <ScoreTrendIcon className={cn('h-3.5 w-3.5', trendColors[data.trendDirection])} />
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">builds after 5 check-ins</span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── ROW 3: FRICTION ── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Friction
                    </span>
                    <InsightInfoModal
                      title="What Is Friction?"
                      explanation="Friction measures how often you report low-energy states like feeling drained, overwhelmed, or scattered. It's shown as a percentage of your check-ins over 30 days. Labels range from 'Low friction' (≤25%) to 'Sustained friction' (>75%), helping you see whether difficult states are occasional or persistent."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-semibold tabular-nums', frictionTone(data.frictionPct ?? 0))}>
                      {data.frictionPct}% <span className="font-normal text-muted-foreground">({data.frictionLabel})</span>
                    </span>
                    <FrictionTrendIcon className={cn('h-3.5 w-3.5', trendColors[data.trendDirection])} />
                  </div>
                </div>

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

                {/* Data source note */}
                {data.checkInCount > 0 && (
                  <p className="text-xs text-muted-foreground/60 text-center">
                    {data.dataSourceNote}
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
