import { TrendingUp, Brain, Users, Zap, Target, Shield, Heart, Crown, Megaphone, Eye } from 'lucide-react';
import { META_SKILLS, getSkillsByCluster } from '@/constants/metaSkills';

interface MetaSkillScore {
  current: number;
  change: number;
}

interface Props {
  mentalFitnessScore: number;
  mentalFitnessChange: number;
  skillScores: Record<string, MetaSkillScore>;
  percentile?: number;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Target: <Target size={16} className="text-primary" />,
  Shield: <Shield size={16} className="text-primary" />,
  Heart: <Heart size={16} className="text-primary" />,
  Crown: <Crown size={16} className="text-primary" />,
  Brain: <Brain size={16} className="text-primary" />,
  Zap: <Zap size={16} className="text-primary" />,
  Megaphone: <Megaphone size={16} className="text-primary" />,
  Eye: <Eye size={16} className="text-primary" />,
};

const MetaSkillProgressCard = ({
  mentalFitnessScore,
  mentalFitnessChange,
  skillScores,
  percentile = 12
}: Props) => {
  const allSkills = Object.values(META_SKILLS);

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

      {/* 8 Meta-Skill Pillars */}
      <div className="space-y-3">
        {allSkills.map((skill, index) => {
          const score = skillScores[skill.key] || { current: 0, change: 0 };
          const isLast = index === allSkills.length - 1;
          return (
            <div key={skill.key} className={`flex items-center justify-between py-2 ${!isLast ? 'border-b border-border' : ''}`}>
              <div className="flex items-center gap-2">
                {ICON_MAP[skill.icon] || <Target size={16} className="text-primary" />}
                <span className="text-sm font-medium">{skill.displayName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">{score.current}/100</span>
                {score.change > 0 && (
                  <span className="text-xs text-accent">↑ +{score.change}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MetaSkillProgressCard;
