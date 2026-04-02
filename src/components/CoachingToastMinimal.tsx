import { X, Lightbulb, Target, BookOpen, Compass, Users, Shield, Zap, Book } from "lucide-react";

interface CoachingToastMinimalProps {
  feedback: {
    type: string;
    message: string;
    suggestion: string;
    pastLearning?: {
      context: string;
      insight: string;
    };
  };
  onClose: () => void;
}

const CoachingToastMinimal = ({ feedback, onClose }: CoachingToastMinimalProps) => {
  // Meta skill type mapping - aligned to 8 canonical Meta Skills
  const metaSkillLabels: Record<string, string> = {
    "self-regulation": "Self-Regulation",
    "resilience": "Resilience",
    "emotional-intelligence": "Emotional Intelligence",
    "confidence": "Confidence",
    "thinking-clarity": "Thinking Clarity",
    "adaptive-capacity": "Adaptive Capacity",
    "influence": "Influence",
    "presence": "Presence",
    // Legacy keys
    "mental-clarity": "Thinking Clarity",
    "social-intelligence": "Influence",
    "leadership": "Presence",
    "adaptability": "Adaptive Capacity",
    "creative-thinking": "Thinking Clarity",
    "ancient-wisdom": "Thinking Clarity",
    "crisis-communication": "Influence"
  };

  // Icon mapping for each meta skill
  const metaSkillIcons: Record<string, React.ReactNode> = {
    "self-regulation": <Target size={14} className="text-forest" />,
    "resilience": <Shield size={14} className="text-forest" />,
    "emotional-intelligence": <Compass size={14} className="text-forest" />,
    "confidence": <Target size={14} className="text-forest" />,
    "thinking-clarity": <Compass size={14} className="text-forest" />,
    "adaptive-capacity": <Zap size={14} className="text-forest" />,
    "influence": <Users size={14} className="text-forest" />,
    "presence": <Lightbulb size={14} className="text-forest" />,
    // Legacy keys
    "mental-clarity": <Compass size={14} className="text-forest" />,
    "social-intelligence": <Users size={14} className="text-forest" />,
    "leadership": <Target size={14} className="text-forest" />,
    "adaptability": <Zap size={14} className="text-forest" />,
    "creative-thinking": <Lightbulb size={14} className="text-forest" />,
    "ancient-wisdom": <Book size={14} className="text-forest" />,
    "crisis-communication": <Lightbulb size={14} className="text-forest" />
  };

  const metaSkillKey = feedback.type || "leadership";
  const metaSkillLabel = metaSkillLabels[metaSkillKey] || "Leadership";
  const metaSkillIcon = metaSkillIcons[metaSkillKey] || <Target size={14} className="text-primary" />;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Blurred backdrop with dim effect */}
      <div 
        className="absolute inset-0 bg-background/60 backdrop-blur-xl"
        onClick={onClose}
      />
      
      {/* 3D Glassmorphic Card */}
      <div className="relative z-10 w-full max-w-md md:max-w-lg bg-card/40 backdrop-blur-2xl rounded-3xl border-2 border-white/10 shadow-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] p-6 md:p-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out ring-1 ring-white/5">
        {/* Top highlight for glass effect */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-3xl" />
        
        {/* Gentle glow aura */}
        <div className="absolute inset-0 rounded-3xl animate-gentle-glow pointer-events-none" />

        {/* Header Section */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            {/* Meta Skill Label */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-forest/10 border border-forest/20 mb-2">
              {metaSkillIcon}
              <span className="text-xs font-semibold uppercase tracking-wide text-forest">
                Meta Skill: {metaSkillLabel}
              </span>
            </div>
            
            {/* Thinking Partner Label */}
            <p className="text-sm text-muted-foreground/80 font-medium">
              MM as Thinking Partner
            </p>
          </div>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-all duration-200 hover:scale-105"
            aria-label="Close coaching insight"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Divider with dots */}
        <div className="flex items-center justify-center my-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-border" />
          <div className="mx-4 flex gap-1">
            <div className="w-1 h-1 rounded-full bg-primary/40" />
            <div className="w-1 h-1 rounded-full bg-primary/40" />
            <div className="w-1 h-1 rounded-full bg-primary/40" />
          </div>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-border" />
        </div>

        {/* Insight Quote Block */}
        <div className="mb-6 p-6 rounded-2xl bg-muted/20 border border-border/30">
          <blockquote className="text-lg md:text-xl font-heading text-foreground leading-relaxed mb-2">
            "{feedback.suggestion}"
          </blockquote>
          
          {feedback.pastLearning?.insight && (
            <p className="text-sm text-muted-foreground italic">
              – {feedback.pastLearning.insight}
            </p>
          )}
        </div>

        {/* Application Prompt */}
        <div className="mb-6 p-4 rounded-xl bg-accent/5 border border-accent/20">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              Apply Now
            </span>
          </div>
          
          <p className="text-sm text-foreground/90 leading-relaxed">
            {feedback.pastLearning?.context || feedback.message}
          </p>
        </div>

        {/* Source Section */}
        <div className="flex items-start gap-3 text-xs text-muted-foreground">
          <BookOpen size={14} className="flex-shrink-0 mt-0.5 text-primary/70" />
          
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              Source: High Performer Wisdom ({metaSkillLabel})
            </p>
            
            <div className="flex items-center gap-3">
              <button className="text-primary hover:text-primary/80 transition-colors underline">
                Link to page to read deeper
              </button>
              <span className="text-border">|</span>
              <button className="text-primary hover:text-primary/80 transition-colors underline">
                Save to read later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachingToastMinimal;
