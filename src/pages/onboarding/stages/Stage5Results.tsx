import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getAllResponses } from "@/utils/onboardingStorage";
import { calculateMetaSkillScores, determineAlignment } from "@/utils/onboardingScoring";
import { ArrowRight, CheckCircle2, AlertCircle, Target } from "lucide-react";

export default function Stage5Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    setTimeout(() => {
      const responses = getAllResponses();
      const behavioralAnswers = {
        q1_setback_response: responses.q1_setback_response,
        q2_performance_gap: responses.q2_performance_gap,
        q3_pressure_response: responses.q3_pressure_response,
        q4_communication_style: responses.q4_communication_style,
        q5_consistency_pattern: responses.q5_consistency_pattern,
        q6_emotional_awareness: responses.q6_emotional_awareness || [],
      };

      const scoringResult = calculateMetaSkillScores(behavioralAnswers);
      const alignment = determineAlignment(
        responses.q7_self_assessed_strength,
        scoringResult.scores
      );

      setResults({ ...scoringResult, alignment });
      setLoading(false);
    }, 2000);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-gold/10 flex items-center justify-center animate-pulse">
          <Target size={40} className="text-gold" />
        </div>
        <h2 className="text-2xl font-headline font-bold">Analyzing Your Baseline...</h2>
        <div className="space-y-2 text-muted-foreground">
          <p>Comparing behavioral patterns with self-perception...</p>
          <p>Identifying your fastest development path...</p>
        </div>
      </div>
    );
  }

  const { scores, profileType, profileDescription, alignment } = results;
  const alignmentIcon = alignment.status === 'MATCH' ? CheckCircle2 : alignment.status === 'UNDERESTIMATE' ? Target : AlertCircle;
  const AlignmentIcon = alignmentIcon;

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      <div className="text-center">
        <h2 className="text-3xl font-headline font-bold mb-2">Your Meta Skill Profile</h2>
        <p className="text-lg text-primary font-semibold">{profileType}</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">Your Scores</h3>
        <div className="space-y-4">
          {[
            { key: 'ALA', label: 'Adaptability & Learning Agility', score: scores.ALA },
            { key: 'CSI', label: 'Communication & Social Intelligence', score: scores.CSI },
            { key: 'SRR', label: 'Self-Regulation & Resilience', score: scores.SRR },
          ].map(skill => (
            <div key={skill.key}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">{skill.label}</span>
                <span className="text-sm font-bold text-gold">{skill.score}/10</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-primary rounded-full transition-all duration-1000"
                  style={{ width: `${(skill.score / 10) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-sm leading-relaxed text-foreground/90">{profileDescription}</p>
      </div>

      <div className={`border rounded-xl p-6 ${
        alignment.status === 'MATCH' ? 'bg-green-50 border-green-200' :
        alignment.status === 'UNDERESTIMATE' ? 'bg-blue-50 border-blue-200' :
        'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start gap-3">
          <AlignmentIcon className={`w-6 h-6 flex-shrink-0 ${
            alignment.status === 'MATCH' ? 'text-green-600' :
            alignment.status === 'UNDERESTIMATE' ? 'text-blue-600' :
            'text-amber-600'
          }`} />
          <div>
            <h4 className="font-semibold mb-2">
              {alignment.status === 'MATCH' ? '✓ Validated' :
               alignment.status === 'UNDERESTIMATE' ? '🎯 Hidden Strength' :
               '💡 Development Opportunity'}
            </h4>
            <p className="text-sm leading-relaxed">{alignment.message}</p>
          </div>
        </div>
      </div>

      <Button size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full">
        Unlock Your Practice Plan
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
