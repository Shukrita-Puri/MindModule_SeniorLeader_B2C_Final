import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getAllResponses, saveResponse, updateSession, getSession } from "@/utils/onboardingStorage";
import { PRACTICE_PRIORITY_LABELS } from "@/utils/innerWorldArchetypes";
import { COMPONENT_LABELS, type ComponentScoresV2 } from "@/utils/innerWorldScoring";
import { ArrowRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/services/authTokenService";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { GradientProgress } from "@/components/ui/gradient-progress";

const DIMENSION_META_SKILLS: Record<keyof ComponentScoresV2, string[]> = {
  energyRegulation: ['Self-Regulation', 'Resilience', 'Confidence'],
  focusRecovery: ['Thinking Clarity', 'Emotional Intelligence'],
  energyRenewal: ['Adaptive Capacity', 'Influence', 'Presence'],
};

const PRACTICE_MODALITY_MAP: Record<string, string> = {
  regulation_composure: 'Somatic Protocols',
  regulation_early: 'Early Signal Training',
  recovery_resilience: 'Recovery Protocols',
  energy_endurance: 'Energy Management',
  focus_clarity: 'Cognitive Sharpening',
  mindset_reframe: 'Mindset Reframes',
};

interface ResultsData {
  baselineScore: number;
  scores: ComponentScoresV2;
  archetype: string;
  archetypeTitle: string;
  archetypeDescription: string;
  insight: string;
  practiceGoalLabel: string;
  practicePriorityTag: string;
}

export default function Stage8Results() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { recordStep } = useOnboardingProgress();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insightOpen, setInsightOpen] = useState(false);
  const completionPersisted = useRef(false);
  const resultsStepPersisted = useRef(false);

  // Persist baseline data to DB (without marking onboarding complete)
  const persistBaseline = async (baselineScore: number, componentScores: ComponentScoresV2, archetype: string, archetypeTitle: string, archetypeDescription: string, insightText: string) => {
    if (completionPersisted.current) return;
    completionPersisted.current = true;

    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('[Results] No auth token available, skipping DB persistence');
        return;
      }
      const responses = getAllResponses();
      const session = getSession();

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (DEV_MODE) {
        headers['x-dev-user-id'] = DEV_USER.id;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/complete-onboarding`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            skip_completion: true,
            mental_fitness_baseline: baselineScore,
            component_scores: componentScores,
            user_archetype: archetype,
            practice_priority_tag: responses.practice_priority_tag,
            pressure_context_tag: responses.pressure_context_tag,
            onboarding_session_id: session?.sessionId,
            identity_role: responses.identity_role,
            biggest_pressure: responses.biggest_pressure,
            emotional_awareness_response: responses.emotional_awareness_response,
            stress_response_response: responses.stress_response_response,
            recovery_patterns_response: responses.recovery_patterns_response,
            mental_clarity_response: responses.mental_clarity_response,
            growth_intention: responses.growth_intention,
            onboarding_insight: insightText,
            archetype_description: archetypeDescription,
            archetype_title: archetypeTitle,
          }),
        }
      );

      if (res.ok) {
        console.log('[Results] ✅ Baseline data persisted to DB (onboarding NOT marked complete)');
      } else {
        const body = await res.text();
        console.error('[Results] ⚠️ Baseline persistence failed:', res.status, body);
        completionPersisted.current = false;
      }
    } catch (err) {
      console.error('[Results] ⚠️ Baseline persistence error:', err);
      completionPersisted.current = false;
    }
  };

  useEffect(() => {
    async function computeResults() {
      const startTime = Date.now();
      try {
        const responses = getAllResponses();
        console.log('[Results] Raw responses:', JSON.stringify(responses));

        if (!responses.emotional_awareness_response || !responses.stress_response_response || 
            !responses.recovery_patterns_response || !responses.mental_clarity_response) {
          setError('Your answers were not saved correctly. Please go back and complete the assessment.');
          setLoading(false);
          return;
        }
        
        const { data, error: fnError } = await supabase.functions.invoke('generate-onboarding-insight', {
          body: {
            answers: {
              q1: responses.emotional_awareness_response,
              q2: responses.stress_response_response,
              q3: responses.recovery_patterns_response,
              q4: responses.mental_clarity_response,
            },
            pressureContextTag: responses.pressure_context_tag,
            practicePriorityTag: responses.practice_priority_tag,
          },
        });

        if (fnError) throw fnError;

        const { baselineScore, componentScores, archetype, archetypeTitle, archetypeDescription, insight } = data;

        const goalLabel = PRACTICE_PRIORITY_LABELS[responses.practice_priority_tag] || 'your highest-leverage area';

        // Ensure minimum 1s loading so user feels real computation
        const elapsed = Date.now() - startTime;
        if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));

        setResults({
          baselineScore,
          scores: componentScores,
          archetype,
          archetypeTitle,
          archetypeDescription,
          insight,
          practiceGoalLabel: goalLabel,
          practicePriorityTag: responses.practice_priority_tag,
        });

      } catch (err) {
        console.error('Error computing results:', err);
        setError('Unable to generate your results. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    computeResults();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !results || error) return;

    persistBaseline(
      results.baselineScore,
      results.scores,
      results.archetype,
      results.archetypeTitle,
      results.archetypeDescription,
      results.insight
    );

    if (!resultsStepPersisted.current) {
      resultsStepPersisted.current = true;
      recordStep('results');
    }
  }, [isAuthenticated, results, error, recordStep]);

  if (loading) {
    return (
      <div className="space-y-8 py-16 text-center animate-fade-in flex flex-col items-center">
        <div className="relative w-32 h-32">
          <div className="absolute inset-0 rounded-full animate-spin" style={{
            background: 'conic-gradient(from 0deg, #08d780, #3b82f6, #8b5cf6, #ec4899, #08d780)',
            filter: 'blur(12px)',
            opacity: 0.6,
            animationDuration: '3s',
          }} />
          <div className="absolute inset-1 rounded-full animate-spin" style={{
            background: 'conic-gradient(from 180deg, #06b6d4, #10b981, #6366f1, #f43f5e, #06b6d4)',
            filter: 'blur(8px)',
            opacity: 0.5,
            animationDuration: '2s',
            animationDirection: 'reverse',
          }} />
          <div className="absolute inset-3 rounded-full" style={{
            background: 'radial-gradient(circle at 35% 35%, rgba(8,215,128,0.4), rgba(99,102,241,0.3), rgba(236,72,153,0.2), transparent 70%)',
            boxShadow: '0 0 40px rgba(8,215,128,0.3), inset 0 0 30px rgba(99,102,241,0.2)',
          }} />
          <div className="absolute inset-3 rounded-full animate-pulse" style={{
            background: 'radial-gradient(circle at 65% 65%, rgba(6,182,212,0.3), rgba(16,185,129,0.2), transparent 60%)',
            animationDuration: '1.5s',
          }} />
        </div>
        <h2 className="text-[20px] font-headline font-bold text-foreground">Analysing Your Pattern...</h2>
        <p className="text-sm text-muted-foreground">Calibrating your performance profile</p>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="space-y-6 py-12 text-center animate-fade-in">
        <p className="text-destructive">{error || 'Something went wrong.'}</p>
        <Button onClick={() => navigate('/onboarding/emotional-awareness')}>Retake Assessment</Button>
      </div>
    );
  }

  const { scores, archetypeTitle, archetypeDescription, insight } = results;

  // Extract first sentence of archetype description for subtitle
  const firstSentence = archetypeDescription.split(/(?<=\.)\s/)[0] || archetypeDescription;

  // Derive strengths and development areas from dimension scores
  const dimensionKeys = Object.keys(scores) as (keyof ComponentScoresV2)[];
  const sorted = [...dimensionKeys].sort((a, b) => scores[b] - scores[a]);
  const strongestDimension = sorted[0];
  const weakestDimension = sorted[sorted.length - 1];
  const strengths = DIMENSION_META_SKILLS[strongestDimension];
  const developmentAreas = DIMENSION_META_SKILLS[weakestDimension];

  // Dimension bars data
  const dimensions = dimensionKeys.map(key => ({
    key,
    label: COMPONENT_LABELS[key],
    value: scores[key],
  }));

  // Collapsible insight preview
  const insightPreview = insight.length > 120 ? insight.slice(0, 120).replace(/\s+\S*$/, '…') : insight;
  const needsTruncation = insight.length > 120;

  // Practice modality
  const practiceModality = PRACTICE_MODALITY_MAP[results.practicePriorityTag] || 'Targeted Protocols';

  return (
    <div className="space-y-5 py-8 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-3">
        <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-body">Your Performance Baseline</p>
        <h2 className="text-[26px] md:text-3xl font-headline font-bold text-foreground tracking-tight">
          You are {archetypeTitle}.
        </h2>
        <p className="text-[14px] max-w-md mx-auto font-body text-foreground/70 leading-relaxed">
          {firstSentence}
        </p>
      </div>

      {/* Dimension Scores */}
      <div className="bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] space-y-4">
        {dimensions.map((dim) => (
          <div key={dim.key} className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] font-medium text-foreground/80">{dim.label}</span>
              <span className="text-[13px] font-semibold text-foreground tabular-nums">{dim.value}</span>
            </div>
            <GradientProgress value={dim.value} />
          </div>
        ))}

        <TooltipProvider delayDuration={200}>
          <div className="flex justify-center pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-[10px] text-muted-foreground/60 underline underline-offset-2 cursor-help">
                  What do these dimensions measure?
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] space-y-2 p-3">
                {dimensions.map((dim) => (
                  <div key={dim.key} className="space-y-0.5">
                    <span className="text-[11px] font-semibold">{dim.label}</span>
                    <div className="flex gap-1 flex-wrap">
                      {DIMENSION_META_SKILLS[dim.key as keyof ComponentScoresV2].map((skill) => (
                        <span key={skill} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* AI Pattern Insight — Collapsible */}
      {insight && (
        <div className="bg-white/65 backdrop-blur-[30px] border border-black/[0.08] rounded-2xl p-5">
          {needsTruncation ? (
            <Collapsible open={insightOpen} onOpenChange={setInsightOpen}>
              <p className="text-sm leading-relaxed text-foreground/90">
                "{insightOpen ? insight : insightPreview}"
              </p>
              <CollapsibleTrigger asChild>
                <button className="mt-2 text-[12px] text-saffron font-medium flex items-center gap-1 hover:opacity-80 transition-opacity">
                  {insightOpen ? 'Show less' : 'Read full analysis'}
                  <ChevronDown size={14} className={`transition-transform ${insightOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90">
              "{insight}"
            </p>
          )}
        </div>
      )}

      {/* Strengths & Development Area */}
      <div className="bg-white/65 backdrop-blur-[30px] border border-black/[0.08] rounded-2xl p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-body">Strengths</p>
          <div className="flex gap-2 flex-wrap">
            {strengths.map((skill) => (
              <span key={skill} className="text-[12px] px-3 py-1 rounded-full bg-saffron/10 text-saffron font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
        <div className="w-full h-px bg-black/[0.06]" />
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-body">Development Area</p>
          <div className="flex gap-2 flex-wrap">
            {developmentAreas.map((skill) => (
              <span key={skill} className="text-[12px] px-3 py-1 rounded-full bg-foreground/5 text-foreground/70 font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Development Path */}
      <div className="bg-white/65 backdrop-blur-[30px] border border-black/[0.08] rounded-2xl p-5 space-y-4">
        <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-body">Development Path</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">Goal Focus</p>
            <p className="text-[14px] font-medium text-foreground capitalize">{results.practiceGoalLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider">Practice Focus</p>
            <p className="text-[14px] font-medium text-foreground">{practiceModality}</p>
          </div>
        </div>
      </div>

      <Button variant="critical" size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full group shadow-lg border-0">
        Activate My System
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
