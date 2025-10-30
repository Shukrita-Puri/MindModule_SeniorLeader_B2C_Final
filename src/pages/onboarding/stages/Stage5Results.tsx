import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getAllResponses } from "@/utils/onboardingStorage";
import { calculateMetaSkillScores, determineAlignment } from "@/utils/onboardingScoring";
import { ArrowRight, CheckCircle2, AlertCircle, Target, TrendingUp, Lightbulb, Brain } from "lucide-react";
import { ResponsiveRadar } from '@nivo/radar';

export default function Stage5Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    setTimeout(() => {
      const responses = getAllResponses();
      const behavioralAnswers = {
        q1_setback_response: responses.q1_setback_response,
        q2_pressure_response: responses.q2_pressure_response,
        q3_communication_style: responses.q3_communication_style,
      };

      const scoringResult = calculateMetaSkillScores(behavioralAnswers);
      const alignment = determineAlignment(
        responses.q4_self_assessed_strength,
        scoringResult.scores
      );

      setResults({ ...scoringResult, alignment, responses });
      setLoading(false);
    }, 2000);
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 py-12 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-gold/10 flex items-center justify-center animate-pulse">
          <Target size={40} className="text-gold" />
        </div>
        <h2 className="text-2xl font-headline font-bold">Analyzing Your Mental Operating System...</h2>
        <div className="space-y-2 text-muted-foreground">
          <p>Comparing behavioral patterns with self-perception...</p>
          <p>Identifying your fastest development path...</p>
        </div>
      </div>
    );
  }

  const { scores, profileType, profileDescription, alignment, responses } = results;
  const alignmentIcon = alignment.status === 'MATCH' ? CheckCircle2 : alignment.status === 'UNDERESTIMATE' ? Target : AlertCircle;
  const AlignmentIcon = alignmentIcon;

  const radarData = [
    { skill: 'Adaptability', score: scores.adaptability_learning },
    { skill: 'Communication', score: scores.communication_social },
    { skill: 'Self-Regulation', score: scores.self_regulation }
  ];

  const lowestSkill = Object.entries(scores).reduce((a, b) => a[1] < b[1] ? a : b);
  const lowestSkillName = lowestSkill[0] === 'adaptability_learning' ? 'Adaptability & Learning Agility' :
                          lowestSkill[0] === 'communication_social' ? 'Communication & Social Intelligence' :
                          'Self-Regulation & Resilience';

  const getPatternInsight = (questionKey: string, answer: string) => {
    const insights: Record<string, Record<string, string>> = {
      q1_setback_response: {
        analyzed_adjusted: "You chose \"analyzed and adjusted\"—this pattern predicts long-term achievement better than talent. Research shows people who adapt after failure develop capabilities 3x faster.",
        took_break: "You chose \"took a break to reset\"—this shows strong self-awareness. Only 23% of people naturally prioritize recovery, yet it's essential for sustained high performance.",
        pushed_through: "You chose \"pushed through with more effort\"—this shows grit, but research indicates adaptation beats persistence alone. You'll benefit from learning when to pivot vs. persist.",
        questioned_path: "You chose \"questioned if you were on the right path\"—this reflective tendency can be powerful when paired with action. Practice will help you channel doubt into strategic pivots."
      },
      q2_pressure_response: {
        pause_collect: "You \"pause before reacting\"—only 12% of people naturally do this, but it's the #1 predictor of influence under pressure. Leaders who pause score 40% higher on effectiveness ratings.",
        stay_calm: "You \"stay surprisingly calm under pressure\"—this composure is rare (found in ~18% of people) and highly valued. You'll learn to leverage this strength in high-stakes moments.",
        defend_explain: "You \"jump to defend or explain immediately\"—this reactive pattern is common (42% of people) but limits influence. Practice will help you build that crucial pause.",
        flustered: "You \"feel flustered under pressure\"—acknowledging this is the first step. 67% of people struggle here, and it's one of the most trainable meta-skills."
      },
      q3_communication_style: {
        ask_questions: "You \"ask questions to understand their view first\"—this curiosity about others' mental models increases influence by 40% compared to logic-first approaches. Research calls this the #1 leadership communication skill.",
        find_analogy: "You \"find an analogy or story that bridges both views\"—this shows sophisticated perspective-taking. Only 15% naturally use bridging strategies, but they're 2.3x more persuasive.",
        walk_through_logic: "You \"walk through your logic step-by-step\"—this works well with analytical audiences but can miss emotional buy-in. You'll practice reading when logic vs. empathy leads.",
        frustrated: "You \"get frustrated they don't see what's obvious\"—this reaction blocks influence. The good news: learning to manage this frustration unlocks major communication gains."
      }
    };

    return insights[questionKey]?.[answer] || "";
  };

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-headline font-bold mb-2">Your Mental Operating System</h2>
        <p className="text-muted-foreground">Here's what your patterns reveal</p>
      </div>

      {/* Mental Fitness Score Preview */}
      <div className="bg-gradient-to-br from-primary/10 to-gold/10 border border-gold/20 rounded-xl p-6">
        <div className="text-center mb-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-2">Your Starting Point</h3>
          <div className="text-5xl font-bold text-gold mb-1">0/100</div>
          <p className="text-xs text-muted-foreground">Mental Fitness Score</p>
        </div>
        <div className="border-t border-border pt-4 text-center">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Your score builds across <span className="font-semibold">Dialogue Room practices</span> (real scenarios) + <span className="font-semibold">Sanctuary sessions</span> (pause/power-up/presence). Track progress toward 100 as you master meta-skills.
          </p>
        </div>
      </div>

      {/* Triangle Chart */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="h-[300px]">
          <ResponsiveRadar
            data={radarData}
            keys={['score']}
            indexBy="skill"
            maxValue={10}
            margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
            curve="linearClosed"
            borderWidth={2}
            borderColor="hsl(var(--gold))"
            gridLevels={5}
            gridShape="linear"
            gridLabelOffset={16}
            enableDots={true}
            dotSize={8}
            dotColor="hsl(var(--gold))"
            dotBorderWidth={2}
            dotBorderColor="hsl(var(--background))"
            enableDotLabel={true}
            dotLabel="score"
            dotLabelYOffset={-12}
            colors="hsl(var(--primary))"
            fillOpacity={0.25}
            blendMode="multiply"
            animate={true}
            motionConfig="gentle"
            theme={{
              text: { fill: "hsl(var(--foreground))" },
              grid: { line: { stroke: "hsl(var(--border))" } }
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gold">{scores.adaptability_learning.toFixed(1)}/10</div>
            <div className="text-xs text-muted-foreground">Adaptability & Learning Agility</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gold">{scores.communication_social.toFixed(1)}/10</div>
            <div className="text-xs text-muted-foreground">Communication & Social Intelligence</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gold">{scores.self_regulation.toFixed(1)}/10</div>
            <div className="text-xs text-muted-foreground">Self-Regulation & Resilience</div>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="bg-gradient-to-br from-primary/5 to-gold/5 border border-border rounded-xl p-6">
        <div className="flex items-start gap-3 mb-3">
          <Brain className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-xl font-headline font-bold mb-2">Your Profile: {profileType}</h3>
            <p className="text-sm leading-relaxed text-foreground/90">{profileDescription}</p>
          </div>
        </div>
      </div>

      {/* Alignment Check */}
      <div className={`border rounded-xl p-6 ${
        alignment.status === 'MATCH' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
        alignment.status === 'UNDERESTIMATE' ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' :
        'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-start gap-3">
          <AlignmentIcon className={`w-6 h-6 flex-shrink-0 ${
            alignment.status === 'MATCH' ? 'text-green-600 dark:text-green-400' :
            alignment.status === 'UNDERESTIMATE' ? 'text-blue-600 dark:text-blue-400' :
            'text-amber-600 dark:text-amber-400'
          }`} />
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              {alignment.status === 'MATCH' ? '✓ Self-Awareness Validated' :
               alignment.status === 'UNDERESTIMATE' ? '🎯 Hidden Strength Discovered' :
               '💡 Development Opportunity Identified'}
            </h4>
            <p className="text-sm leading-relaxed mb-3">{alignment.message}</p>
            <p className="text-xs italic opacity-75">
              {alignment.status === 'MATCH' 
                ? 'This self-awareness accelerates your development significantly.'
                : alignment.status === 'UNDERESTIMATE'
                ? 'You have more capability than you give yourself credit for—lean into it.'
                : 'The gap between perception and reality is where growth happens fastest.'}
            </p>
          </div>
        </div>
      </div>

      {/* What Your Patterns Reveal */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-lg">What Your Patterns Reveal</h3>
        </div>
        <div className="space-y-4">
          {responses.q1_setback_response && (
            <div className="pb-4 border-b border-border last:border-0 last:pb-0">
              <div className="text-sm font-medium mb-1">Your Setback Response:</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {getPatternInsight('q1_setback_response', responses.q1_setback_response)}
              </p>
            </div>
          )}
          {responses.q2_pressure_response && (
            <div className="pb-4 border-b border-border last:border-0 last:pb-0">
              <div className="text-sm font-medium mb-1">Your Pressure Response:</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {getPatternInsight('q2_pressure_response', responses.q2_pressure_response)}
              </p>
            </div>
          )}
          {responses.q3_communication_style && (
            <div className="pb-4 border-b border-border last:border-0 last:pb-0">
              <div className="text-sm font-medium mb-1">Your Communication Style:</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {getPatternInsight('q3_communication_style', responses.q3_communication_style)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Your Fastest Development Path */}
      <div className="bg-gradient-to-br from-gold/10 to-primary/10 border border-gold/20 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-lg">Your Fastest Development Path</h3>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Primary Focus: {lowestSkillName}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lowestSkill[0] === 'adaptability_learning' 
                ? "You'll benefit most from scenarios that challenge you to pivot quickly and learn from feedback. Practice will focus on flexible thinking, rapid adjustment, and treating setbacks as data."
                : lowestSkill[0] === 'communication_social'
                ? "You have strong adaptability and self-regulation—now build the social intelligence to leverage them. Practice will focus on reading room dynamics, navigating stakeholder conflict, and influencing when perspectives differ."
                : "You'll benefit most from techniques that help you stay composed under pressure and recover from setbacks faster. Practice will focus on emotional regulation, stress management, and building resilience."}
            </p>
          </div>
          <div className="bg-background/50 rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">Your practice scenarios will include:</div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {lowestSkill[0] === 'communication_social' ? (
                <>
                  <li>• Delivering critical feedback to defensive colleagues</li>
                  <li>• Navigating conflicting stakeholder priorities</li>
                  <li>• High-stakes presentations to skeptical audiences</li>
                  <li>• Reading and adapting to room dynamics in real-time</li>
                </>
              ) : lowestSkill[0] === 'adaptability_learning' ? (
                <>
                  <li>• Responding to unexpected setbacks in key projects</li>
                  <li>• Learning quickly in unfamiliar domains</li>
                  <li>• Pivoting strategy when initial approaches fail</li>
                  <li>• Seeking and integrating feedback effectively</li>
                </>
              ) : (
                <>
                  <li>• Managing stress in high-pressure moments</li>
                  <li>• Recovering quickly from professional setbacks</li>
                  <li>• Maintaining composure during conflict</li>
                  <li>• Building sustainable energy management habits</li>
                </>
              )}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground italic">
            Research shows 3-4 practice sessions per week → measurable improvement in 21-30 days.
          </p>
        </div>
      </div>

      {/* CTA */}
      <Button size="lg" onClick={() => navigate("/onboarding/payment")} className="w-full">
        Unlock Your Practice Plan
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </div>
  );
}
