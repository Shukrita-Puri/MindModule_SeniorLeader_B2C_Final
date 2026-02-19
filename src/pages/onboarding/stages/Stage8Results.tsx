import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAllResponses, saveResponse, updateSession } from "@/utils/onboardingStorage";
import { PRACTICE_PRIORITY_LABELS } from "@/utils/innerWorldArchetypes";
import { COMPONENT_LABELS, type ComponentScoresV2 } from "@/utils/innerWorldScoring";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DIMENSION_META_SKILLS: Record<keyof ComponentScoresV2, string[]> = {
  energyRegulation: ['Self-Regulation', 'Resilience', 'Confidence'],
  focusRecovery: ['Thinking Clarity', 'Emotional Intelligence'],
  energyRenewal: ['Adaptive Capacity', 'Influence', 'Presence'],
};

// Dimension descriptors removed — pills communicate the detail now

interface ResultsData {
  baselineScore: number;
  scores: ComponentScoresV2;
  archetype: string;
  archetypeTitle: string;
  archetypeDescription: string;
  insight: string;
  practiceGoalLabel: string;
}

export default function Stage8Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        
        saveResponse('mental_fitness_baseline', baselineScore);
        saveResponse('baseline_established_date', new Date().toISOString());
        saveResponse('inner_world_archetype', { id: archetype, title: archetypeTitle });
        
        updateSession({
          mental_fitness_baseline: baselineScore,
          user_archetype: archetype,
          component_scores: componentScores,
        });

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

  if (loading) {
    return (
      <div className="space-y-8 py-16 text-center animate-fade-in flex flex-col items-center">
        {/* Animated analysing orb */}
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
        <h2 className="text-2xl font-headline font-bold text-foreground">Analysing Your Pattern...</h2>
        <p className="text-sm text-muted-foreground">Mapping your self-mastery profile</p>
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

  const radarPoints = [
    { key: 'energyRegulation' as keyof ComponentScoresV2, label: COMPONENT_LABELS.energyRegulation, value: scores.energyRegulation },
    { key: 'focusRecovery' as keyof ComponentScoresV2, label: COMPONENT_LABELS.focusRecovery, value: scores.focusRecovery },
    { key: 'energyRenewal' as keyof ComponentScoresV2, label: COMPONENT_LABELS.energyRenewal, value: scores.energyRenewal },
  ];

  const cx = 150, cy = 130, radius = 90;
  const angleStep = (2 * Math.PI) / 3;
  const startAngle = -Math.PI / 2;
  
  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridLevels = [25, 50, 75, 100];

  return (
    <div className="space-y-6 py-8 animate-fade-in">
      {/* Archetype Reveal */}
      <div className="text-center space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-body">Your Leadership Pattern</p>
        <h2 className="text-3xl md:text-4xl font-headline font-bold text-foreground tracking-tight">
          You are {archetypeTitle}.
        </h2>
        <p className="text-base max-w-md mx-auto font-subheadline italic text-saffron">
          {archetypeDescription}
        </p>
      </div>

      {/* Your Self-Mastery Map — Unified */}
      <div className="bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08] rounded-2xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] space-y-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center font-body">Your Self-Mastery Map</h3>
        <svg viewBox="0 0 300 270" className="w-full max-w-sm mx-auto">
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#08d780" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#08d780" stopOpacity="0.05" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {gridLevels.map((level) => (
            <polygon
              key={level}
              points={radarPoints.map((_, i) => {
                const pt = getPoint(i, level);
                return `${pt.x},${pt.y}`;
              }).join(' ')}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="1.2"
              opacity={0.9}
            />
          ))}
          {radarPoints.map((_, i) => {
            const pt = getPoint(i, 100);
            return <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="hsl(var(--border))" strokeWidth="0.8" opacity={0.6} />;
          })}
          <polygon
            points={radarPoints.map((p, i) => {
              const pt = getPoint(i, p.value);
              return `${pt.x},${pt.y}`;
            }).join(' ')}
            fill="url(#radarFill)"
            stroke="#08d780"
            strokeWidth="2"
            filter="url(#glow)"
          />
          {radarPoints.map((p, i) => {
            const pt = getPoint(i, p.value);
            return <circle key={i} cx={pt.x} cy={pt.y} r="5" fill="#08d780" stroke="hsl(var(--background))" strokeWidth="2" />;
          })}
          {radarPoints.map((p, i) => {
            const labelPt = getPoint(i, 125);
            return (
              <text key={i} x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle" className="text-[10px] fill-foreground font-medium">
                {p.label} ({p.value})
              </text>
            );
          })}
        </svg>

        <TooltipProvider delayDuration={200}>
          <div className="space-y-2 pt-3">
            {radarPoints.map((point) => (
              <Tooltip key={point.key}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-help">
                    <span className="text-xs font-semibold text-foreground">{point.label}</span>
                    <span className="text-[9px] text-muted-foreground/50">ⓘ</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex gap-1.5 flex-wrap max-w-[220px]">
                  {DIMENSION_META_SKILLS[point.key].map((skill) => (
                    <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary-foreground/80">
                      {skill}
                    </span>
                  ))}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* AI Pattern Insight */}
      {insight && (
        <div className="bg-white/65 backdrop-blur-[30px] border border-black/[0.08] rounded-2xl p-6">
          <p className="text-sm leading-relaxed text-foreground/90">
            "{insight}"
          </p>
        </div>
      )}

      {/* Development Path */}
      <div className="bg-white/65 backdrop-blur-[30px] border border-black/[0.08] rounded-2xl p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Your practice will prioritise <span className="font-semibold text-saffron">{results.practiceGoalLabel}</span> — the highest-leverage area given your pattern.
        </p>
      </div>

      {/* Value Proposition */}
      <div className="bg-transparent border-l-2 border-[#8B7D6B] pl-5 py-2 space-y-3">
        <h3 className="text-lg font-headline font-bold text-saffron">
          Perform at your highest level. Consistently.
        </h3>
        <div className="space-y-3">
          <p className="text-sm text-saffron/80 leading-relaxed">
            Your baseline tells the system who you are. How you regulate under pressure, where you recover, where you lead from strength.
          </p>
          <p className="text-sm text-saffron/80 leading-relaxed">
            As your day shifts, the calendar, the stakes, the load, your practice moves with it. What you need at 7am is not what you need at 9pm.
          </p>
          <p className="text-sm text-saffron font-medium leading-relaxed">
            The result is not a programme you follow. It is a system that works around you.
          </p>
        </div>
      </div>

      <Button variant="critical" size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full group shadow-lg border-0">
        Unlock My Practice
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
