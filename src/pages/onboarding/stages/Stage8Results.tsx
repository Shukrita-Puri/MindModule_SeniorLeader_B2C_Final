import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getAllResponses, saveResponse, updateSession } from "@/utils/onboardingStorage";
import { ARCHETYPES, PRACTICE_PRIORITY_LABELS } from "@/utils/innerWorldArchetypes";
import { COMPONENT_LABELS, type ComponentScoresV2 } from "@/utils/innerWorldScoring";
import { ArrowRight, Target, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
        
        // Save results to localStorage session
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
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  const { baselineScore, scores, archetypeTitle, archetypeDescription, insight, practiceGoalLabel } = results;

  // Radar chart data
  const radarPoints = [
    { label: COMPONENT_LABELS.energyRegulation, value: scores.energyRegulation },
    { label: COMPONENT_LABELS.focusRecovery, value: scores.focusRecovery },
    { label: COMPONENT_LABELS.energyRenewal, value: scores.energyRenewal },
  ];

  // SVG radar chart helpers
  const cx = 150, cy = 130, radius = 90;
  const angleStep = (2 * Math.PI) / 3;
  const startAngle = -Math.PI / 2;
  
  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const radarPath = radarPoints
    .map((p, i) => {
      const pt = getPoint(i, p.value);
      return `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
    })
    .join(' ') + ' Z';

  const gridLevels = [25, 50, 75, 100];

  return (
    <div className="space-y-6 py-8 animate-fade-in">
      {/* Archetype Reveal */}
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground uppercase tracking-widest">Your Leadership Pattern</p>
        <h2 className="text-3xl md:text-4xl font-headline font-bold text-foreground">
          You are {archetypeTitle}.
        </h2>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          {archetypeDescription}
        </p>
      </div>

      {/* Radar Chart */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
        <svg viewBox="0 0 300 270" className="w-full max-w-xs mx-auto">
          {/* Grid */}
          {gridLevels.map((level) => (
            <polygon
              key={level}
              points={radarPoints.map((_, i) => {
                const pt = getPoint(i, level);
                return `${pt.x},${pt.y}`;
              }).join(' ')}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              opacity={0.5}
            />
          ))}
          {/* Axes */}
          {radarPoints.map((_, i) => {
            const pt = getPoint(i, 100);
            return <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.3} />;
          })}
          {/* Data polygon */}
          <polygon
            points={radarPoints.map((p, i) => {
              const pt = getPoint(i, p.value);
              return `${pt.x},${pt.y}`;
            }).join(' ')}
            fill="hsl(var(--primary) / 0.15)"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
          />
          {/* Data points */}
          {radarPoints.map((p, i) => {
            const pt = getPoint(i, p.value);
            return <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="hsl(var(--primary))" />;
          })}
          {/* Labels */}
          {radarPoints.map((p, i) => {
            const labelPt = getPoint(i, 120);
            return (
              <text
                key={i}
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] fill-muted-foreground"
              >
                {p.label} ({p.value})
              </text>
            );
          })}
        </svg>
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
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm text-foreground leading-relaxed">
          Your practice will prioritise <span className="font-semibold text-primary">{practiceGoalLabel}</span> — the highest-leverage area given your pattern.
        </p>
      </div>

      {/* What the app does */}
      <div className="bg-muted/30 rounded-xl p-5 border border-border space-y-2.5">
        <p className="text-xs text-muted-foreground">
          <span className="text-primary">•</span> Your daily check-in feeds a personalised Inner Readiness Score.
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="text-primary">•</span> Your archetype shapes the strengths and watch-fors in your daily Compass.
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="text-primary">•</span> Your practice is selected based on what your state and day actually need.
        </p>
      </div>

      <Button size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full group shadow-lg">
        <Sparkles className="w-5 h-5 mr-2" />
        Connect &amp; Continue
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
