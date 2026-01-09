import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getAllResponses, saveResponse } from "@/utils/onboardingStorage";
import { calculateInnerWorldScores, DIMENSION_LABELS, getNationalAverage } from "@/utils/innerWorldScoring";
import { determineArchetype, getArchetypeInsights } from "@/utils/innerWorldArchetypes";
import { ArrowRight, Target, TrendingUp, Lightbulb, Sparkles } from "lucide-react";

export default function Stage8Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    setTimeout(() => {
      const responses = getAllResponses();
      const innerWorldAnswers = {
        emotional_awareness_response: responses.emotional_awareness_response,
        stress_response_response: responses.stress_response_response,
        recovery_patterns_response: responses.recovery_patterns_response,
        mental_clarity_response: responses.mental_clarity_response,
        growth_intention_response: responses.growth_intention_response,
      };

      const profile = calculateInnerWorldScores(innerWorldAnswers);
      const archetype = determineArchetype(profile);
      const insights = getArchetypeInsights(archetype, profile);
      const nationalAvg = getNationalAverage();

      // Save results
      saveResponse('inner_world_profile', profile);
      saveResponse('inner_world_archetype', archetype);
      saveResponse('mental_fitness_baseline', profile.overallScore);
      saveResponse('baseline_established_date', new Date().toISOString());

      setResults({ profile, archetype, insights, nationalAvg });
      setLoading(false);
    }, 2000);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Target size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-headline font-bold">Analyzing Your Inner World...</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Mapping your self-mastery patterns...</p>
          <p>Identifying strengths and growth areas...</p>
        </div>
      </div>
    );
  }

  const { profile, archetype, insights, nationalAvg } = results;

  return (
    <div className="space-y-6 py-8 animate-fade-in">
      {/* Hero Score */}
      <div className="text-center space-y-4">
        <h2 className="text-2xl md:text-3xl font-headline font-bold">Your Inner World Score</h2>
        <div className="text-5xl md:text-6xl font-bold text-primary">
          {profile.overallScore}<span className="text-2xl text-muted-foreground">/100</span>
        </div>
        <div className="max-w-md mx-auto space-y-3">
          <div className="relative">
            <Progress value={profile.overallScore} className="h-3" />
            <div className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/50" style={{ left: `${nationalAvg}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>National Avg: {nationalAvg}/100</span>
            <span className="text-primary font-medium">You: {profile.overallScore}/100</span>
          </div>
        </div>
        <p className="text-sm bg-primary/5 border border-border p-4 rounded-xl max-w-lg mx-auto">
          You're at the <span className="font-semibold text-primary">{profile.readinessLevel}</span> level. 
          Your strength is <span className="font-semibold">{DIMENSION_LABELS[profile.primaryStrength]}</span>.
        </p>
      </div>

      {/* Archetype */}
      <div className="bg-gradient-to-br from-primary/10 to-saffron/10 border border-primary/20 rounded-xl p-6 shadow-lg">
        <h3 className="text-xl font-headline font-bold mb-1">You're {archetype.title}</h3>
        <p className="text-xs text-muted-foreground mb-3">Found in the {archetype.percentile} of professionals</p>
        <p className="text-sm leading-relaxed mb-3">{archetype.description}</p>
        <div className="bg-background/50 rounded-lg p-3 border border-border">
          <p className="text-sm font-medium text-primary">{archetype.unlockStatement}</p>
        </div>
      </div>

      {/* Pattern Insights */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-saffron" />
          <h3 className="font-semibold text-lg">What Your Patterns Reveal</h3>
        </div>
        <div className="space-y-3">
          {insights.patternRevelations.map((pattern: string, index: number) => (
            <p key={index} className="text-sm leading-relaxed text-muted-foreground pb-3 border-b border-border last:border-0 last:pb-0">
              {pattern}
            </p>
          ))}
        </div>
      </div>

      {/* Development Path */}
      <div className="bg-gradient-to-br from-saffron/10 to-primary/10 border border-saffron/20 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-saffron" />
          <h3 className="font-semibold text-lg">Your Development Path</h3>
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-1">Primary Focus: {insights.primaryFocus}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">You'll build the ability to:</div>
            <ul className="text-sm space-y-1.5 text-muted-foreground">
              {insights.expectedOutcomes.map((outcome: string, i: number) => <li key={i}>• {outcome}</li>)}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground italic">{insights.timeline}</p>
        </div>
      </div>

      <Button size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full group shadow-lg">
        <Sparkles className="w-5 h-5 mr-2" />
        Unlock Your Plan
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
