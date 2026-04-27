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
  /** % of check-ins in the positive band (focused/steady) over 30d. Mirror of friction at the check-in level. Null until ≥5 check-ins. */
  positiveRate?: { pct: number; n: number } | null;
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
      // Source: brief_snapshots.score (the daily Brief composite).
      // Baseline = mean of first 3 scored Briefs (chronological).
      // Current  = mean of last 3 scored Briefs.
      // Rationale: smooths single-day volatility while still reflecting trajectory.
      //
      // NOTE (RLS): brief_snapshots SELECT policy gates rows by
      // `user_id = auth.jwt() ->> 'sub'`. The shared `supabase` client only
      // carries the anon key, so direct .from('brief_snapshots') queries
      // return 0 rows in production. We therefore call PostgREST directly
      // with the Auth0 access token to satisfy RLS. (DEV_MODE keeps the
      // anon-key fallback used elsewhere in this component.)
      const accessToken = await getAuthToken();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!accessToken || !supabaseUrl || !anonKey) return;

      const baseUrl = `${supabaseUrl}/rest/v1/brief_snapshots`;
      const commonParams =
        `select=score,local_date` +
        `&user_id=eq.${encodeURIComponent(effectiveUserId)}` +
        `&score=not.is.null`;
      const headers = {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      };

      const [earliestRes, latestRes] = await Promise.all([
        fetch(`${baseUrl}?${commonParams}&order=local_date.asc&limit=3`, { headers }),
        fetch(`${baseUrl}?${commonParams}&order=local_date.desc&limit=3`, { headers }),
      ]);

      if (!earliestRes.ok || !latestRes.ok) {
        console.warn(
          '[LeadershipPatternsCard] briefScore PostgREST status',
          earliestRes.status,
          latestRes.status,
        );
        return;
      }

      const earliestRows = (await earliestRes.json()) as Array<{ score: number; local_date: string }>;
      const latestRows = (await latestRes.json()) as Array<{ score: number; local_date: string }>;
      const earliest = earliestRows.map((r) => r.score);
      const latest = latestRows.map((r) => r.score);
      const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      const baseline = mean(earliest);
      const current = mean(latest);
      // Only show "current" once the user has at least one Brief beyond the baseline window
      const earliestDates = new Set(earliestRows.map((r) => r.local_date));
      const hasNewerBrief = latestRows.some((r) => !earliestDates.has(r.local_date));
      setBriefScore({
        baseline: baseline != null ? Math.round(baseline) : null,
        current: current != null && hasNewerBrief ? Math.round(current) : null,
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
          positiveRate,
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

  // Consistency tone — higher is positive (green), lower is negative (red). Inverse of friction.
  const consistencyTone = (pct: number): string => {
    if (pct >= 75) return 'text-emerald-600';
    if (pct >= 50) return 'text-amber-500';
    return 'text-red-500';
  };

  const consistencyLabel = (pct: number): string => {
    if (pct >= 75) return 'Highly consistent';
    if (pct >= 50) return 'Building consistency';
    if (pct >= 25) return 'Inconsistent';
    return 'Low consistency';
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
            const ScoreTrendIcon = trendIcons[data.trendDirection];
            const FrictionTrendIcon = trendIcons[data.trendDirection];
            return (
              <div className="space-y-4">

                {/* ── ROW 1: ARCHETYPE (with tooltip on right) ── */}
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
                  </div>
                </div>

                {/* ── ROW 2: PERFORMANCE READINESS SCORE ── */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-taupe shrink-0">
                    Performance Readiness Score
                  </span>
                  <div className="flex items-center gap-2">
                    {baselineComposite != null ? (
                      <>
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
                          <span className="text-xs text-muted-foreground italic">evolves with each Brief</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">builds with your daily Brief</span>
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
                    {data.frictionLabel && (
                      <span className={cn('text-sm', frictionTone(data.frictionPct ?? 0))}>
                        ({data.frictionLabel})
                      </span>
                    )}
                    <FrictionTrendIcon className={cn('h-3.5 w-3.5', trendColors[data.trendDirection])} />
                  </div>
                </div>

                {/* ── ROW 4: CONSISTENCY (mirror of Friction at check-in level) ── */}
                {data.positiveRate && (data.checkInCount ?? 0) >= 5 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-medium uppercase tracking-wider text-taupe">
                        Consistency
                      </span>
                      <InsightInfoModal
                        title="What Is Consistency?"
                        explanation="How often you’re checking in focused or steady over the past month. The other side of Friction — a higher number means more consistent positive states."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {data.positiveRate.pct}%
                      </span>
                      <span className={cn('text-sm', consistencyTone(data.positiveRate.pct))}>
                        ({consistencyLabel(data.positiveRate.pct)})
                      </span>
                      <ScoreTrendIcon className={cn('h-3.5 w-3.5', trendColors[data.trendDirection])} />
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
