import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, MessageSquare, Sparkles, ArrowRight } from 'lucide-react';
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

interface LeadershipPatternsData {
  aiObservation: string | null;
  baselineArchetypeId: string;
  baselineArchetypeTitle: string;
  currentArchetypeId: string | null;
  currentArchetypeTitle: string | null;
  archetypeEvolved: boolean;
  archetypeLeanOn: string;
  archetypeWatchFor: string;
  baselineScores: DimensionScores | null;
  currentScores: DimensionScores | null;
  scoreDeltas: DimensionScores | null;
  frictionPct: number;
  frictionLabel: string;
  trendDirection: 'improving' | 'stable' | 'declining';
  typicalState: string | null;
  recurringThemes: { phrase: string; count: number }[];
  coachStrength: string | null;
  coachFriction: string | null;
  checkInCount: number;
  coachSessionCount: number;
  hasWearable: boolean;
  hasCalendar: boolean;
  dataSourceNote: string;
}

interface LeadershipPatternsCardProps {
  userId?: string;
  prefetchedData?: LeadershipPatternsData | null;
}

const trendIcons = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
};

const trendColors = {
  improving: 'text-emerald-500',
  declining: 'text-red-400',
  stable: 'text-muted-foreground',
};

// DEV_MODE archetype resolution
function devResolveArchetype(er: number, fr: number, en: number) {
  if (er >= 65 && en >= 55) return { id: "grounded-leader", title: "The Grounded Master", leanOn: "Stability and presence — you lead from a centered place.", watchFor: "Over-reliance on composure when renewal is needed." };
  if (en >= 65 && er >= 50) return { id: "resilient-performer", title: "The Resilient Performer", leanOn: "Recovery capacity — you absorb impact and bounce back.", watchFor: "Pushing through when regulation would serve you better." };
  if (fr >= 65 && er >= 45) return { id: "clear-thinker", title: "The Clear Thinker", leanOn: "Mental clarity — you cut through complexity with precision.", watchFor: "Over-thinking when action or rest is what's needed." };
  if (er >= 60 && fr < 50) return { id: "intensity-driver", title: "The Intensity Driver", leanOn: "Directed force — you channel intensity into focused action.", watchFor: "Intensity without clarity can fragment your focus." };
  return { id: "adaptive-navigator", title: "The Adaptive Navigator", leanOn: "Flexibility — you read the field and adjust in real time.", watchFor: "Adapting constantly without anchoring can be depleting." };
}

const LeadershipPatternsCard = ({ userId, prefetchedData }: LeadershipPatternsCardProps) => {
  const [data, setData] = useState<LeadershipPatternsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use prefetched data if available (avoids duplicate edge function call)
    if (prefetchedData && prefetchedData.baselineArchetypeId) {
      setData(prefetchedData);
      setLoading(false);
      return;
    }
    if (userId) fetchData();
  }, [userId, prefetchedData]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (DEV_MODE) {
        const effectiveUserId = DEV_USER.id;
        const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
        const fourteenDaysAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');

        const [checkInsRes, themesRes, coachRes, profileRes] = await Promise.all([
          supabase.from('daily_checkins').select('checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at').eq('user_id', effectiveUserId).gte('checkin_date', thirtyDaysAgo).order('checkin_date', { ascending: true }),
          supabase.from('daily_themes').select('theme_phrase, theme_driver').eq('user_id', effectiveUserId).gte('theme_date', thirtyDaysAgo),
          supabase.from('user_coach_insights').select('insight_content, created_at, insight_type').eq('user_id', effectiveUserId).order('created_at', { ascending: false }).limit(10),
          supabase.from('profiles').select('user_archetype, component_scores').eq('id', effectiveUserId).maybeSingle(),
        ]);

        const checkIns = checkInsRes.data || [];
        const themes = themesRes.data || [];
        const coachInsights = coachRes.data || [];
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

        // Coach insights
        const strengthKw = /strength|strong|excel|composure|resilient|clarity|conviction|grounded|held|showed up|brought|capacity|resource/i;
        const frictionKw = /struggle|challenge|pattern|watch for|friction|tendency|recurring|avoidance|escalated|reactive|lost|slipping|cost/i;
        let coachStrength: string | null = null;
        let coachFriction: string | null = null;
        for (const ins of coachInsights) {
          const ic = ins.insight_content || '';
          if (!coachStrength && strengthKw.test(ic)) coachStrength = ic.substring(0, 120);
          if (!coachFriction && frictionKw.test(ic)) coachFriction = ic.substring(0, 120);
          if (coachStrength && coachFriction) break;
        }

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

        // Use available dimensions — fall back to clarity/confidence as proxy for energy if missing
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
          coachStrength,
          coachFriction,
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
        setData(result.data as LeadershipPatternsData);
      }
    } catch (err) {
      console.error('[LeadershipPatternsCard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderDimensionRow = (label: string, baseline: number, current: number | undefined, delta: number | undefined, trend?: 'improving' | 'stable' | 'declining') => {
    const TrendIcon = trend ? trendIcons[trend] : null;
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-muted-foreground w-28">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70 tabular-nums">{baseline}</span>
          {current !== undefined && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
              <span className="font-semibold text-saffron tabular-nums">{current}</span>
              {delta !== undefined && (
                <span className={cn(
                  'text-xs tabular-nums',
                  delta > 0 ? 'text-saffron' : delta < 0 ? 'text-red-400' : 'text-muted-foreground'
                )}>
                  ({delta > 0 ? '+' : ''}{delta})
                </span>
              )}
              {TrendIcon && trend && (
                <TrendIcon className={cn('h-3 w-3', trendColors[trend])} />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Self Mastery Patterns
          </span>
          <InsightInfoModal
            title="Your Self Mastery Patterns"
            explanation="What is consistently true about how you operate — not what you reported today, but what the data reveals about your patterns over time. This card draws from your check-ins, coach sessions, recurring Compass themes, practices, and wearable data over 30 days."
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-6">Unable to load self mastery patterns.</p>
        ) : (
          <div className="space-y-5">

            {/* ── SECTION 1: AI OBSERVATION ── */}
            {data.aiObservation && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-primary/70 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {data.aiObservation}
                  </p>
                </div>
              </div>
            )}

            {/* ── SECTION 2: YOUR DIMENSIONS ── */}
            <div className="space-y-3">
              <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
                Your Dimensions
              </p>

              {/* Archetype */}
              {data.archetypeEvolved && data.baselineArchetypeTitle && data.currentArchetypeTitle ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground/70">{data.baselineArchetypeTitle}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-primary/60" />
                    <span className="text-sm font-semibold text-saffron">{data.currentArchetypeTitle}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-saffron">
                    {data.currentArchetypeTitle || data.baselineArchetypeTitle}
                  </span>
                </div>
              )}

              {/* Three dimensions */}
              {data.baselineScores && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                  {renderDimensionRow('Recalibration', data.baselineScores.recalibration, data.currentScores?.recalibration, data.scoreDeltas?.recalibration, data.currentScores ? data.trendDirection : undefined)}
                  {renderDimensionRow('Clarity', data.baselineScores.clarity, data.currentScores?.clarity, data.scoreDeltas?.clarity, data.currentScores ? data.trendDirection : undefined)}
                  {renderDimensionRow('Renewal', data.baselineScores.renewal, data.currentScores?.renewal, data.scoreDeltas?.renewal, data.currentScores ? data.trendDirection : undefined)}
                  {!data.currentScores && (
                    <p className="text-[10px] text-muted-foreground/60 pt-1">
                      Your current scores build after 5 check-ins
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── SECTION 3: WHAT YOUR PATTERNS REVEAL ── */}
            <div className="space-y-3 pt-3">
              <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
                What Your Patterns Reveal
              </p>

              {/* Friction frequency with trend */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Friction</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-sm font-semibold',
                    data.frictionPct <= 25 ? 'text-emerald-500' : data.frictionPct <= 50 ? 'text-amber-500' : 'text-red-400'
                  )}>
                    {data.frictionPct}% ({data.frictionLabel})
                  </span>
                  {(() => {
                    const TIcon = trendIcons[data.trendDirection];
                    return <TIcon className={cn('h-3.5 w-3.5', trendColors[data.trendDirection])} />;
                  })()}
                </div>
              </div>

              {/* Recurring themes */}
              {data.recurringThemes.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
                    Recurring Themes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.recurringThemes.map((theme, i) => (
                      <span
                        key={i}
                        className="px-4 py-2 bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 text-primary rounded-full text-sm font-medium border border-primary/20 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                      >
                        "{theme.phrase}"
                        {theme.count > 1 && (
                          <span className="ml-1 opacity-60">({theme.count}×)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Heading for Lean On / Watch For */}
              <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground pt-1">
                Your Inner Edge
              </p>

              {/* Lean On */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Lean On</p>
                  {data.coachStrength ? (
                    <div className="flex items-start gap-1.5">
                      <MessageSquare className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground italic">"{data.coachStrength}"</p>
                    </div>
                  ) : (
                    <p className="text-sm text-saffron">{data.archetypeLeanOn}</p>
                  )}
                </div>
              </div>

              {/* Watch For */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Watch For</p>
                  {data.coachFriction ? (
                    <div className="flex items-start gap-1.5">
                      <MessageSquare className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground italic">"{data.coachFriction}"</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-saffron">{data.archetypeWatchFor}</p>
                      {data.coachSessionCount < 3 && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Will personalize with coach sessions</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Progressive messages */}
            {data.checkInCount === 0 && (
              <p className="text-xs text-muted-foreground/70 text-center">
                Complete your first check-in to start mapping your patterns.
              </p>
            )}
            {data.checkInCount > 0 && data.checkInCount < 5 && (
              <p className="text-xs text-muted-foreground/70 text-center">
                {data.checkInCount} check-in{data.checkInCount > 1 ? 's' : ''} logged. Patterns become clearer with each one.
              </p>
            )}

            {/* ── SECTION 4: DATA SOURCE NOTE ── */}
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

export default LeadershipPatternsCard;
