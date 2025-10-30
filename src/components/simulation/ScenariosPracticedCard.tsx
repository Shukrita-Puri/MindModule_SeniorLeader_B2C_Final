import { Target, MessageSquare, Zap, Brain, TrendingUp } from 'lucide-react';

interface Props {
  totalPractices: number;
  thisWeekBreakdown: {
    communication: number;
    adaptive: number;
    energy: number;
    context: number;
  };
  consistencyRating: string;
  percentile: number;
}

const ScenariosPracticedCard = ({
  totalPractices,
  thisWeekBreakdown,
  consistencyRating,
  percentile
}: Props) => {
  return (
    <div className="bg-card border border-gold/10 rounded-lg p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-headline font-semibold">Scenarios Practiced</h3>
      </div>

      {/* Total Count */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-foreground mb-1">
          📊 {totalPractices} real-life situations
        </div>
        <p className="text-xs text-muted-foreground">Track practical application across life domains</p>
      </div>

      {/* This Week Breakdown */}
      <div className="bg-muted/20 rounded-lg p-4 mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">This Week:</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-primary" />
            <span className="text-foreground/90">{thisWeekBreakdown.communication} Communication challenges navigated</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            <span className="text-foreground/90">{thisWeekBreakdown.adaptive} Adaptive decisions made under pressure</span>
          </div>
          <div className="flex items-center gap-2">
            <Target size={14} className="text-primary" />
            <span className="text-foreground/90">{thisWeekBreakdown.energy} Energy state transitions managed</span>
          </div>
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-primary" />
            <span className="text-foreground/90">{thisWeekBreakdown.context} Complex contexts triangulated</span>
          </div>
        </div>
      </div>

      {/* Consistency Rating */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Consistency Rating:</p>
          <p className="text-sm font-semibold text-primary">{consistencyRating} (top {percentile}%)</p>
        </div>
        <TrendingUp size={20} className="text-accent" />
      </div>

      <p className="text-xs text-muted-foreground mt-3 italic">
        💪 You're building decision-making reps across all life domains
      </p>
    </div>
  );
};

export default ScenariosPracticedCard;
