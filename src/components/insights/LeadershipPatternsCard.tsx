import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, MessageSquare, Sparkles, ArrowRight } from 'lucide-react';
import { CardContent, CardHeader } from '@/components/ui/card';
import InsightInfoModal from '@/components/insights/InsightInfoModal';
import LuxuryInsightCard from '@/components/insights/LuxuryInsightCard';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';

interface DimensionScores {
  recalibration: number;
  clarity: number;
  renewal: number;
}

interface LeadershipPatternsData {
  userArchetype: string | null;
  archetypeTitle: string | null;
  strengthArea: string | null;
  growthArea: string | null;
  typicalState: string | null;
  distribution: Record<string, number>;
  compositeAvg30: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  frictionPct: number;
  frictionLabel: string;
  recurringThemes: { phrase: string; count: number }[];
  coachStrength: string | null;
  coachFriction: string | null;
  aiObservation: string | null;
  checkInCount: number;
  baselineScores: DimensionScores | null;
  currentScores: DimensionScores | null;
  baselineArchetypeTitle: string | null;
  currentArchetypeTitle: string | null;
  archetypeEvolved: boolean;
  scoreDeltas: DimensionScores | null;
}

interface LeadershipPatternsCardProps {
  userId?: string;
}

const stateLabels: Record<string, string> = {
  focused: 'Focused',
  steady: 'Steady',
  scattered: 'Scattered',
  drained: 'Drained',
  overwhelmed: 'Overwhelmed',
};

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

// DEV_MODE archetype resolution matching edge function cascade
function devResolveArchetype(er: number, fr: number, en: number) {
  if (er >= 65 && en >= 55) return { title: "The Grounded Master", strengthArea: "Recalibration", growthArea: "Renewal depth" };
  if (en >= 65 && er >= 50) return { title: "The Resilient Performer", strengthArea: "Renewal", growthArea: "Clarity under load" };
  if (fr >= 65 && er >= 45) return { title: "The Clear Thinker", strengthArea: "Clarity", growthArea: "Recalibration speed" };
  if (er >= 60 && fr < 50) return { title: "The Intensity Driver", strengthArea: "Recalibration", growthArea: "Clarity balance" };
  return { title: "The Adaptive Navigator", strengthArea: "Flexibility", growthArea: "Recalibration depth" };
}

const LeadershipPatternsCard = ({ userId }: LeadershipPatternsCardProps) => {
  const [data, setData] = useState<LeadershipPatternsData | null>(null);
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

        const [checkInsRes, themesRes, coachRes, profileRes] = await Promise.all([
          supabase
            .from('daily_checkins')
            .select('checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at')
            .eq('user_id', effectiveUserId)
            .gte('checkin_date', thirtyDaysAgo)
            .order('checkin_date', { ascending: true }),
          supabase
            .from('daily_themes')
            .select('theme_phrase, theme_driver')
            .eq('user_id', effectiveUserId)
            .gte('theme_date', thirtyDaysAgo),
          supabase
            .from('user_coach_insights')
            .select('insight_content, created_at, insight_type')
            .eq('user_id', effectiveUserId)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('profiles')
            .select('user_archetype, component_scores')
            .eq('id', effectiveUserId)
            .single(),
        ]);

        const checkIns = checkInsRes.data || [];
        const themes = themesRes.data || [];
        const coachInsights = coachRes.data || [];

        // Distribution
        const distribution: Record<string, number> = {
          focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0,
        };
        checkIns.forEach((c) => {
          const o = c.outcome?.toLowerCase();
          if (o && o in distribution) distribution[o]++;
        });

        const sortedStates = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
        const typicalState = sortedStates[0]?.[1] > 0 ? sortedStates[0][0] : null;

        // Friction
        const totalCheckins = checkIns.length;
        const lowStates = checkIns.filter((c) =>
          ['drained', 'overwhelmed', 'scattered'].includes(c.outcome?.toLowerCase() || '')
        ).length;
        const frictionPct = totalCheckins > 0 ? Math.round((lowStates / totalCheckins) * 100) : 0;
        const frictionLabel =
          frictionPct <= 25 ? 'Low friction' : frictionPct <= 50 ? 'Moderate friction' : 'High friction pattern';

        // Composite trend
        const scores = checkIns.filter((c) => c.energy_balance != null).map((c) => ({ date: c.checkin_date, score: c.energy_balance as number }));
        const compositeAvg30 = scores.length > 0 ? Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length) : 0;

        const now = new Date();
        const sevenStr = format(subDays(now, 7), 'yyyy-MM-dd');
        const fourteenStr = format(subDays(now, 14), 'yyyy-MM-dd');
        const recent = scores.filter((s) => s.date >= sevenStr);
        const prior = scores.filter((s) => s.date >= fourteenStr && s.date < sevenStr);
        let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
        if (recent.length > 0 && prior.length > 0) {
          const delta = recent.reduce((s, c) => s + c.score, 0) / recent.length - prior.reduce((s, c) => s + c.score, 0) / prior.length;
          if (delta > 5) trendDirection = 'improving';
          else if (delta < -5) trendDirection = 'declining';
        }

        // Recurring themes
        const themeCounts = new Map<string, number>();
        themes.forEach((t) => { if (t.theme_phrase) themeCounts.set(t.theme_phrase, (themeCounts.get(t.theme_phrase) || 0) + 1); });
        const recurringThemes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([phrase, count]) => ({ phrase, count }));

        // Coach insights
        const strengthKw = ['strength', 'strong', 'excel', 'composure', 'resilient', 'clarity', 'conviction', 'grounded'];
        const frictionKw = ['struggle', 'challenge', 'pattern', 'watch for', 'friction', 'tendency', 'recurring', 'avoidance'];
        let coachStrength: string | null = null;
        let coachFriction: string | null = null;
        for (const ins of coachInsights) {
          const lc = (ins.insight_content || '').toLowerCase();
          if (!coachStrength && strengthKw.some((k) => lc.includes(k))) coachStrength = ins.insight_content;
          if (!coachFriction && frictionKw.some((k) => lc.includes(k))) coachFriction = ins.insight_content;
          if (coachStrength && coachFriction) break;
        }

        // Resolve archetype from component_scores (v2 keys with legacy fallback)
        const cs = profileRes.data?.component_scores as any;
        const bER = cs?.energyRegulation ?? cs?.q2_energy_regulation ?? 50;
        const bFR = cs?.focusRecovery ?? cs?.q3_focus_recovery ?? 50;
        const bEN = cs?.energyRenewal ?? cs?.q4_energy_renewal ?? 50;
        const baselineArch = devResolveArchetype(bER, bFR, bEN);
        const baselineScores: DimensionScores = { recalibration: Math.round(bER), clarity: Math.round(bFR), renewal: Math.round(bEN) };

        // Current scores from last 7 days
        const recentCheckins = checkIns.filter((c) => c.checkin_date >= sevenStr);
        const recentEB = recentCheckins.filter((c) => c.energy_balance != null).map((c) => c.energy_balance as number);
        const recentCL = recentCheckins.filter((c) => c.clarity_level != null).map((c) => c.clarity_level as number);
        const recentCF = recentCheckins.filter((c) => c.confidence_level != null).map((c) => c.confidence_level as number);

        let currentScores: DimensionScores | null = null;
        let currentArchetypeTitle: string | null = null;
        let archetypeEvolved = false;
        let scoreDeltas: DimensionScores | null = null;

        const hasEnoughForCurrent = totalCheckins >= 7 && recentEB.length > 0 && recentCL.length > 0 && recentCF.length > 0;
        if (hasEnoughForCurrent) {
          const avgER = Math.round(recentEB.reduce((s, v) => s + v, 0) / recentEB.length);
          const avgFR = Math.round(recentCL.reduce((s, v) => s + v, 0) / recentCL.length);
          const avgEN = Math.round(recentCF.reduce((s, v) => s + v, 0) / recentCF.length);
          currentScores = { recalibration: avgER, clarity: avgFR, renewal: avgEN };
          const currentArch = devResolveArchetype(avgER, avgFR, avgEN);
          currentArchetypeTitle = currentArch.title;
          scoreDeltas = {
            recalibration: currentScores.recalibration - baselineScores.recalibration,
            clarity: currentScores.clarity - baselineScores.clarity,
            renewal: currentScores.renewal - baselineScores.renewal,
          };
          archetypeEvolved = baselineArch.title !== currentArchetypeTitle;
        }

        setData({
          userArchetype: profileRes.data?.user_archetype || null,
          archetypeTitle: baselineArch.title,
          strengthArea: baselineArch.strengthArea,
          growthArea: baselineArch.growthArea,
          typicalState,
          distribution,
          compositeAvg30,
          trendDirection,
          frictionPct,
          frictionLabel,
          recurringThemes,
          coachStrength,
          coachFriction,
          aiObservation: totalCheckins >= 3 ? `Your readiness has been ${trendDirection} this period, with ${frictionLabel.toLowerCase()} across your check-ins.` : null,
          checkInCount: totalCheckins,
          baselineScores,
          currentScores,
          baselineArchetypeTitle: baselineArch.title,
          currentArchetypeTitle,
          archetypeEvolved,
          scoreDeltas,
        });
        setLoading(false);
        return;
      }

      // Production: edge function
      const auth0Client = (window as any).__auth0Client;
      if (!auth0Client) { setLoading(false); return; }
      const accessToken = await auth0Client.getAccessTokenSilently();
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

  const TrendIcon = data ? trendIcons[data.trendDirection] : Minus;

  const renderDimensionRow = (label: string, baseline: number, current: number | undefined, delta: number | undefined) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-xs text-muted-foreground w-28">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/70 tabular-nums">{baseline}</span>
        {current !== undefined && (
          <>
            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="font-semibold text-foreground tabular-nums">{current}</span>
            {delta !== undefined && (
              <span className={cn(
                'text-xs tabular-nums',
                delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-400' : 'text-muted-foreground'
              )}>
                ({delta > 0 ? '+' : ''}{delta})
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <LuxuryInsightCard>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Self Mastery Patterns
          </span>
          <InsightInfoModal
            title="Your Self Mastery Patterns"
            explanation="What is consistently true about how you lead. This card draws from your coach sessions, your recurring Compass themes, and your Inner Readiness history over 30 days — surfacing the strengths your coach keeps returning to, the friction patterns that keep showing up, and the overall direction of your inner state over time."
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
            {/* AI Observation — headline insight */}
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

            {/* Archetype line — with evolution if applicable */}
            {(data.archetypeTitle || data.currentArchetypeTitle) && (
              <div>
                {data.archetypeEvolved && data.baselineArchetypeTitle && data.currentArchetypeTitle ? (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Archetype Evolution</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground/70">{data.baselineArchetypeTitle}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-primary/60" />
                      <span className="text-sm font-semibold text-foreground">{data.currentArchetypeTitle}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Archetype</span>
                    <span className="text-sm font-semibold text-foreground">
                      {data.archetypeTitle}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Three-Dimension Progress */}
            {data.baselineScores && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">
                  {data.currentScores ? 'Dimension Progress' : 'Your Starting Point'}
                </p>
                {renderDimensionRow('Recalibration', data.baselineScores.recalibration, data.currentScores?.recalibration, data.scoreDeltas?.recalibration)}
                {renderDimensionRow('Clarity', data.baselineScores.clarity, data.currentScores?.clarity, data.scoreDeltas?.clarity)}
                {renderDimensionRow('Renewal', data.baselineScores.renewal, data.currentScores?.renewal, data.scoreDeltas?.renewal)}
                {!data.currentScores && (
                  <p className="text-[10px] text-muted-foreground/60 pt-1">
                    Current scores build after 7 check-ins
                  </p>
                )}
              </div>
            )}

            {/* Composite score + trend */}
            {data.compositeAvg30 > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">30-day Inner Readiness avg</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{data.compositeAvg30}</span>
                  <div className={cn('flex items-center gap-1', trendColors[data.trendDirection])}>
                    <TrendIcon className="h-3.5 w-3.5" />
                    <span className="text-xs capitalize">{data.trendDirection}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Typical state — supporting line */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Most frequent state (30 days)</span>
              <span className="text-sm font-semibold text-foreground capitalize">
                {data.typicalState ? stateLabels[data.typicalState] || data.typicalState : '—'}
              </span>
            </div>

            {/* Friction frequency */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Friction frequency</span>
              <span className={cn(
                'text-sm font-semibold',
                data.frictionPct <= 25 ? 'text-emerald-500' : data.frictionPct <= 50 ? 'text-amber-500' : 'text-red-400'
              )}>
                {data.frictionLabel} ({data.frictionPct}%)
              </span>
            </div>

            {/* Strength & Friction from coach */}
            {(data.strengthArea || data.coachStrength || data.coachFriction) && (
              <div className="pt-3 border-t border-border/30 space-y-3">
                {/* Strength */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
                  <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Lean on: {data.strengthArea || 'Self-Regulation'}
                    </p>
                    {data.coachStrength ? (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground italic">"{data.coachStrength}"</p>
                      </div>
                    ) : data.archetypeTitle ? (
                      <p className="text-xs text-muted-foreground">Based on your {data.archetypeTitle} profile</p>
                    ) : null}
                  </div>
                </div>

                {/* Friction */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Watch for: {data.growthArea || 'Energy Management'}
                    </p>
                    {data.coachFriction ? (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground italic">"{data.coachFriction}"</p>
                      </div>
                    ) : data.checkInCount > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Low-state patterns appeared in {data.frictionPct}% of check-ins over 30 days
                      </p>
                    ) : data.archetypeTitle ? (
                      <p className="text-xs text-muted-foreground">Based on your {data.archetypeTitle} profile</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Recurring Compass themes */}
            {data.recurringThemes.length > 0 && (
              <div className="pt-3 border-t border-border/30">
                <p className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-3">
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

export default LeadershipPatternsCard;
