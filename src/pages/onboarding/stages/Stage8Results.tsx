import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getAllResponses, saveResponse, updateSession } from "@/utils/onboardingStorage";
import { PRACTICE_PRIORITY_LABELS } from "@/utils/innerWorldArchetypes";
import { COMPONENT_LABELS, type ComponentScoresV2 } from "@/utils/innerWorldScoring";
import { ArrowRight, Target, Lock } from "lucide-react";
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
      <div className="space-y-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Target size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-headline font-bold">Analyzing Your Pattern...</h2>
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
        <p className="text-sm text-muted-foreground uppercase tracking-widest">Your Leadership Pattern</p>
        <h2 className="text-3xl md:text-4xl font-headline font-bold text-foreground">
          You are {archetypeTitle}.
        </h2>
        <p className="text-base max-w-md mx-auto" style={{ color: '#08d780' }}>
          {archetypeDescription}
        </p>
      </div>

      {/* Your Self-Mastery Map — Unified */}
      <div className="bg-gradient-to-br from-card via-card to-primary/5 border border-border rounded-xl p-3 shadow-lg space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest text-center">Your Self-Mastery Map</h3>
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

        <div className="space-y-2 pt-3">
          {radarPoints.map((point) => (
            <div key={point.key} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground min-w-[70px]">{point.label}</span>
              {DIMENSION_META_SKILLS[point.key].map((skill) => (
                <span key={skill} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/8 text-muted-foreground">
                  {skill}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* AI Pattern Insight */}
      {insight && (
        <div className="bg-gradient-to-br from-primary/10 to-saffron/10 border border-primary/20 rounded-xl p-6">
          <p className="text-sm leading-relaxed text-foreground/90 italic">
            "{insight}"
          </p>
        </div>
      )}

      {/* Development Path */}
      <div className="bg-muted/20 border border-border rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Your practice will prioritise <span className="font-semibold" style={{ color: '#08d780' }}>{results.practiceGoalLabel}</span> — the highest-leverage area given your pattern.
        </p>
      </div>

      {/* Value Proposition */}
      <div className="bg-transparent border-l-4 border-[#8B7D6B] pl-5 py-2 space-y-3">
        <h3 className="text-lg font-headline font-bold text-foreground">
          Perform at your highest level. Consistently.
        </h3>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your baseline tells the system who you are — how you regulate under pressure, where you recover, where you lead from strength.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            As your day shifts — the calendar, the stakes, the load — your practice moves with it. What you need at 7am is not what you need at 9pm.
          </p>
          <p className="text-sm text-foreground font-medium leading-relaxed">
            The result is not a programme you follow. It is a system that works around you.
          </p>
        </div>
      </div>

      <Button variant="forest" size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full group shadow-lg text-white border-0" style={{ backgroundColor: '#08d780' }}>
        <Lock className="w-5 h-5 mr-2" />
        Unlock My Practice
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
