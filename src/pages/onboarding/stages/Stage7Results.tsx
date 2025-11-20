import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getAllResponses, saveResponse } from "@/utils/onboardingStorage";
import { calculateSelfRegulationScore, getScoreRangeCategory, getGapToElite, getNationalAverage } from "@/utils/selfRegulationScoring";
import { determineArchetype, getArchetypeInsights, getLowestComponent } from "@/utils/userArchetypeEngine";
import { ArrowRight, Target, TrendingUp, Lightbulb, Brain, Sparkles } from "lucide-react";

export default function Stage7Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    setTimeout(() => {
      const responses = getAllResponses();
      
      const selfRegAnswers = {
        energy_regulation_response: responses.energy_regulation_response,
        focus_recovery_response: responses.focus_recovery_response,
        energy_renewal_response: responses.energy_renewal_response,
        growth_priority: responses.growth_priority
      };

      const scoringResult = calculateSelfRegulationScore(selfRegAnswers);
      const archetype = determineArchetype(scoringResult.componentScores);
      const insights = getArchetypeInsights(archetype, scoringResult.componentScores);
      const lowestComponent = getLowestComponent(scoringResult.componentScores);
      const scoreRange = getScoreRangeCategory(scoringResult.mentalFitnessBaseline);
      const gapToElite = getGapToElite(scoringResult.mentalFitnessBaseline);
      const nationalAvg = getNationalAverage();

      // Save results for future use
      saveResponse('mental_fitness_baseline', scoringResult.mentalFitnessBaseline);
      saveResponse('component_scores', scoringResult.componentScores);
      saveResponse('user_archetype', archetype);
      saveResponse('baseline_established_date', new Date().toISOString());
      saveResponse('recommended_mastery', archetype.recommendedMastery);
      saveResponse('growth_area', lowestComponent.label);

      setResults({
        scoringResult,
        archetype,
        insights,
        lowestComponent,
        scoreRange,
        gapToElite,
        nationalAvg,
        responses
      });
      setLoading(false);
    }, 2000);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Target size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-headline font-bold">Analyzing Your Self-Regulation Patterns...</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Calculating your Mental Fitness baseline...</p>
          <p>Identifying your natural strengths and growth areas...</p>
        </div>
      </div>
    );
  }

  const { scoringResult, archetype, insights, lowestComponent, scoreRange, gapToElite, nationalAvg } = results;

  return (
    <div className="space-y-6 py-8 animate-fade-in">
      {/* Section 1: Mental Fitness Baseline (Hero) */}
      <div className="text-center space-y-4">
        <h2 className="text-2xl md:text-3xl font-headline font-bold">Your Mental Fitness Score</h2>
        
        <div className="text-5xl md:text-6xl font-bold text-primary">
          {scoringResult.mentalFitnessBaseline}<span className="text-2xl text-muted-foreground">/100</span>
        </div>

        {/* Progress Bar with National Average Marker */}
        <div className="max-w-md mx-auto space-y-3">
          <div className="relative">
            <Progress value={scoringResult.mentalFitnessBaseline} className="h-3" />
            {/* National Average Marker */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/50" 
              style={{ left: `${nationalAvg}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>National Avg: {nationalAvg}/100</span>
            <span className="text-primary font-medium">You: {scoringResult.mentalFitnessBaseline}/100</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary/5 to-gold/5 border border-border rounded-lg p-4 max-w-lg mx-auto">
          <p className="text-sm leading-relaxed">
            You're starting in the <span className="font-semibold text-primary">{scoreRange.percentile}</span> of professionals who take this assessment.
            {gapToElite > 0 && (
              <> But here's what matters: you're <span className="font-semibold text-gold">{gapToElite} points away</span> from the Elite Performance Zone (90+).</>
            )}
          </p>
        </div>
      </div>

      {/* Section 2: Your Profile (Archetype) */}
      <div className="bg-gradient-to-br from-primary/10 to-gold/10 border border-primary/20 rounded-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-headline font-bold mb-1">You're a {archetype.title}</h3>
            <p className="text-xs text-muted-foreground mb-2">Found in the {archetype.percentile} of professionals</p>
          </div>
        </div>
        
        <p className="text-sm leading-relaxed mb-3">{archetype.description}</p>
        
        <div className="bg-background/50 rounded-lg p-3 border border-border">
          <p className="text-sm font-medium text-primary">{archetype.unlockStatement}</p>
        </div>
      </div>

      {/* Section 3: What Your Patterns Reveal */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-lg">What Your Patterns Reveal</h3>
        </div>
        <div className="space-y-3">
          {insights.patternRevealation.map((pattern: string, index: number) => (
            <div key={index} className="pb-3 border-b border-border last:border-0 last:pb-0">
              <p className="text-sm leading-relaxed text-muted-foreground">{pattern}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Your Development Path */}
      <div className="bg-gradient-to-br from-gold/10 to-primary/10 border border-gold/20 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-lg">Your Development Path</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-1">Primary Focus: {lowestComponent.label}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {insights.developmentFocus}
            </p>
          </div>

          <div className="bg-background/50 rounded-lg p-4 space-y-3">
            <div className="text-sm font-medium">You'll build the foundational tools to:</div>
            <ul className="text-sm space-y-1.5 text-muted-foreground">
              {insights.expectedOutcomes.map((outcome: string, index: number) => (
                <li key={index}>• {outcome}</li>
              ))}
            </ul>
          </div>

          <div className="bg-background/50 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Expected Timeline:</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {insights.timeline}
            </p>
          </div>

          <p className="text-xs text-muted-foreground italic">
            Research shows 3-4 practice sessions per week lead to measurable improvement in 21-30 days. Leaders who complete 8 weeks report significant improvement in stress recovery and sustained performance.
          </p>
        </div>
      </div>

      {/* CTA */}
      <Button 
        size="lg" 
        onClick={() => navigate("/onboarding/context-connection")} 
        className="w-full group"
      >
        <Sparkles className="w-5 h-5 mr-2" />
        Unlock Your Plan
        <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
