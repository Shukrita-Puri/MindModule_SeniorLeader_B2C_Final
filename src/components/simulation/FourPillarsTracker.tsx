import { Brain, Users, Zap, Target, CheckCircle, Clock } from 'lucide-react';

interface PillarProgress {
  score: number;
  mastered: string[];
  developing: string[];
  scenariosPracticed: number;
  breakthroughs?: number;
  adaptations?: number;
  pausePractices?: number;
  flowStates?: number;
  energyTransitions?: number;
  blindSpotsRevealed?: number;
}

interface Props {
  thinkingClarity: PillarProgress;
  socialIntelligence: PillarProgress;
  adaptiveCapacity: PillarProgress;
  selfRegulation: PillarProgress;
}

const FourPillarsTracker = ({
  thinkingClarity,
  socialIntelligence,
  adaptiveCapacity,
  selfRegulation
}: Props) => {
  const renderProgressBar = (score: number) => {
    const filledBars = Math.round((score / 100) * 25);
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-sm ${
              i < filledBars ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-headline font-semibold mb-4">Four Pillars Progress Tracker</h3>

      {/* Thinking Clarity */}
      <div className="border border-gold/20 rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-primary" />
          <h4 className="font-semibold text-foreground">THINKING CLARITY</h4>
          <span className="ml-auto text-lg font-bold text-foreground">{thinkingClarity.score}/100</span>
        </div>
        
        {renderProgressBar(thinkingClarity.score)}
        
        <div className="mt-3 space-y-1 text-sm">
          {thinkingClarity.mastered.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-foreground/90">
              <CheckCircle size={14} className="text-accent" />
              <span>{skill}</span>
            </div>
          ))}
          {thinkingClarity.developing.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} />
              <span>{skill} (developing)</span>
            </div>
          ))}
        </div>
        
        <div className="mt-3 text-xs text-muted-foreground">
          Scenarios Practiced: {thinkingClarity.scenariosPracticed} • Blind Spots Revealed: {thinkingClarity.blindSpotsRevealed || 0}
        </div>
      </div>

      {/* Social Intelligence */}
      <div className="border border-gold/20 rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-primary" />
          <h4 className="font-semibold text-foreground">SOCIAL INTELLIGENCE</h4>
          <span className="ml-auto text-lg font-bold text-foreground">{socialIntelligence.score}/100</span>
        </div>
        
        {renderProgressBar(socialIntelligence.score)}
        
        <div className="mt-3 space-y-1 text-sm">
          {socialIntelligence.mastered.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-foreground/90">
              <CheckCircle size={14} className="text-accent" />
              <span>{skill}</span>
            </div>
          ))}
          {socialIntelligence.developing.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} />
              <span>{skill} (developing)</span>
            </div>
          ))}
        </div>
        
        <div className="mt-3 text-xs text-muted-foreground">
          Scenarios Practiced: {socialIntelligence.scenariosPracticed} • Breakthrough Moments: {socialIntelligence.breakthroughs || 0}
        </div>
      </div>

      {/* Adaptive Capacity */}
      <div className="border border-gold/20 rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-primary" />
          <h4 className="font-semibold text-foreground">ADAPTIVE CAPACITY</h4>
          <span className="ml-auto text-lg font-bold text-foreground">{adaptiveCapacity.score}/100</span>
        </div>
        
        {renderProgressBar(adaptiveCapacity.score)}
        
        <div className="mt-3 space-y-1 text-sm">
          {adaptiveCapacity.mastered.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-foreground/90">
              <CheckCircle size={14} className="text-accent" />
              <span>{skill}</span>
            </div>
          ))}
          {adaptiveCapacity.developing.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} />
              <span>{skill} (developing)</span>
            </div>
          ))}
        </div>
        
        <div className="mt-3 text-xs text-muted-foreground">
          Scenarios Practiced: {adaptiveCapacity.scenariosPracticed} • Successful Adaptations: {adaptiveCapacity.adaptations || 0}
        </div>
      </div>

      {/* Self-Regulation */}
      <div className="border border-gold/20 rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-primary" />
          <h4 className="font-semibold text-foreground">SELF-REGULATION</h4>
          <span className="ml-auto text-lg font-bold text-foreground">{selfRegulation.score}/100</span>
        </div>
        
        {renderProgressBar(selfRegulation.score)}
        
        <div className="mt-3 space-y-1 text-sm">
          {selfRegulation.mastered.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-foreground/90">
              <CheckCircle size={14} className="text-accent" />
              <span>{skill}</span>
            </div>
          ))}
          {selfRegulation.developing.map((skill, idx) => (
            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} />
              <span>{skill} (developing)</span>
            </div>
          ))}
        </div>
        
        <div className="mt-3 text-xs text-muted-foreground">
          Pause Practices: {selfRegulation.pausePractices || 0} • Flow States Achieved: {selfRegulation.flowStates || 0} • Energy Transitions: {selfRegulation.energyTransitions || 0}
        </div>
      </div>
    </div>
  );
};

export default FourPillarsTracker;
