import { TrendingUp, Brain, Users, Zap, Target } from 'lucide-react';

interface MetaSkillScore {
  current: number;
  change: number;
}

interface Props {
  mentalFitnessScore: number;
  mentalFitnessChange: number;
  thinkingClarity: MetaSkillScore;
  socialIntelligence: MetaSkillScore;
  adaptiveCapacity: MetaSkillScore;
  selfRegulation: MetaSkillScore;
  percentile?: number;
}

const MetaSkillProgressCard = ({
  mentalFitnessScore,
  mentalFitnessChange,
  thinkingClarity,
  socialIntelligence,
  adaptiveCapacity,
  selfRegulation,
  percentile = 12
}: Props) => {
  return (
    <div className="bg-card border border-gold/20 rounded-lg p-6 shadow-md">
      {/* Mental Fitness Score - Hero */}
      <div className="text-center mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Mental Fitness Score
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-5xl font-bold text-foreground">{mentalFitnessScore}</span>
          <span className="text-2xl text-muted-foreground">/100</span>
          {mentalFitnessChange > 0 && (
            <div className="flex items-center gap-1 text-accent">
              <TrendingUp size={18} />
              <span className="text-sm font-medium">+{mentalFitnessChange}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          You're in the top {percentile}% of practitioners
        </p>
      </div>

      {/* Four Meta-Skill Pillars */}
      <div className="space-y-4">
        {/* Thinking Clarity */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            <span className="text-sm font-medium">Thinking Clarity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{thinkingClarity.current}/100</span>
            {thinkingClarity.change > 0 && (
              <span className="text-xs text-accent">↑ +{thinkingClarity.change}</span>
            )}
          </div>
        </div>

        {/* Social Intelligence */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <span className="text-sm font-medium">Social Intelligence</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{socialIntelligence.current}/100</span>
            {socialIntelligence.change > 0 && (
              <span className="text-xs text-accent">↑ +{socialIntelligence.change}</span>
            )}
          </div>
        </div>

        {/* Adaptive Capacity */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <span className="text-sm font-medium">Adaptive Capacity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{adaptiveCapacity.current}/100</span>
            {adaptiveCapacity.change > 0 && (
              <span className="text-xs text-accent">↑ +{adaptiveCapacity.change}</span>
            )}
          </div>
        </div>

        {/* Self-Regulation */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-primary" />
            <span className="text-sm font-medium">Self-Regulation</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{selfRegulation.current}/100</span>
            {selfRegulation.change > 0 && (
              <span className="text-xs text-accent">↑ +{selfRegulation.change}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetaSkillProgressCard;
