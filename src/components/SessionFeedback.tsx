
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Lightbulb, Target, Scale, HelpCircle, X as XIcon, Repeat, Puzzle, Feather, Settings } from "lucide-react";

interface SessionFeedbackProps {
  sessionType?: string;
  onSubmit: (feedback: {
    resonance: 'loved' | 'clarifying' | 'insightful' | 'balanced' | 'unclear' | 'missed';
    deeperFocus?: string;
    nextSessionFocus?: string[];
  }) => void;
  onSkip: () => void;
}

type ResonanceType = 'loved' | 'clarifying' | 'insightful' | 'balanced' | 'unclear' | 'missed';

const resonanceOptions = [
  { id: 'loved' as ResonanceType, label: 'Loved it', icon: Heart },
  { id: 'clarifying' as ResonanceType, label: 'Clarifying', icon: Lightbulb },
  { id: 'insightful' as ResonanceType, label: 'Insightful', icon: Target },
  { id: 'balanced' as ResonanceType, label: 'Balanced', icon: Scale },
  { id: 'unclear' as ResonanceType, label: 'Unclear', icon: HelpCircle },
  { id: 'missed' as ResonanceType, label: 'Missed the Mark', icon: XIcon },
];

const nextFocusOptions = [
  { id: 'continue', label: 'Continue this thread', icon: Repeat },
  { id: 'explore', label: 'Explore a new pattern', icon: Puzzle },
  { id: 'reflective', label: 'Reflective deep dive', icon: Feather },
  { id: 'apply', label: 'Apply to real scenario', icon: Settings },
];

const placeholders = [
  "Sharper emotional lens",
  "More pressure-testing",
  "Deeper counterpoint"
];

const SessionFeedback = ({ onSubmit, onSkip }: SessionFeedbackProps) => {
  const [resonance, setResonance] = useState<ResonanceType | null>(null);
  const [deeperFocus, setDeeperFocus] = useState("");
  const [nextSessionFocus, setNextSessionFocus] = useState<string[]>([]);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Rotate placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleResonanceSelect = (id: ResonanceType) => {
    setResonance(id);
  };

  const toggleNextFocus = (id: string) => {
    setNextSessionFocus(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (resonance) {
      setShowConfirmation(true);
      setTimeout(() => {
        onSubmit({
          resonance,
          deeperFocus: deeperFocus || undefined,
          nextSessionFocus: nextSessionFocus.length > 0 ? nextSessionFocus : undefined
        });
      }, 2000);
    }
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-b from-background to-muted/20 rounded-2xl p-8 max-w-md w-full text-center animate-in fade-in zoom-in duration-300">
          <div className="text-4xl mb-3">💡</div>
          <p className="text-sm text-muted-foreground">
            Reflection saved. Your input sharpens future calibrations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-b from-background via-background to-muted/20 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-[hsl(var(--gold))]/20 shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Session Reflection</h2>
          <p className="text-xs text-muted-foreground animate-in fade-in duration-700">
            Take 5 seconds to tune the next conversation.
          </p>
        </div>

        {/* Core Feedback */}
        <div className="px-6 pb-5 space-y-3">
          <p className="text-sm text-foreground/80">How did this session land for you?</p>
          <div className="grid grid-cols-3 gap-2">
            {resonanceOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = resonance === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => handleResonanceSelect(option.id)}
                  className={`
                    flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-300
                    ${isSelected 
                      ? 'border-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10 shadow-[0_0_20px_hsl(var(--gold))/30]' 
                      : 'border-border hover:border-[hsl(var(--gold))]/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <Icon 
                    size={18} 
                    className={isSelected ? 'text-[hsl(var(--gold))]' : 'text-muted-foreground'}
                  />
                  <span className={`text-xs ${isSelected ? 'text-[hsl(var(--gold))] font-medium' : 'text-muted-foreground'}`}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Micro Feedback */}
        <div className="px-6 pb-5 space-y-2">
          <p className="text-sm text-foreground/80">Where could we go deeper next time?</p>
          <Textarea
            value={deeperFocus}
            onChange={(e) => setDeeperFocus(e.target.value)}
            placeholder={placeholders[currentPlaceholder]}
            className="min-h-[50px] text-sm resize-none transition-all duration-300"
          />
        </div>

        {/* Forward Signal */}
        <div className="px-6 pb-5 space-y-2">
          <p className="text-sm text-foreground/80">Next Session Focus</p>
          <div className="flex flex-wrap gap-2">
            {nextFocusOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = nextSessionFocus.includes(option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => toggleNextFocus(option.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-300 border
                    ${isSelected
                      ? 'bg-[hsl(var(--gold))]/10 border-[hsl(var(--gold))] text-[hsl(var(--gold))]'
                      : 'bg-muted/50 border-border text-muted-foreground hover:border-[hsl(var(--gold))]/50'
                    }
                  `}
                >
                  <Icon size={12} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            onClick={onSkip}
            variant="ghost"
            className="flex-1 text-sm"
          >
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!resonance}
            className={`
              flex-1 text-sm bg-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/90 text-gold-foreground
              ${resonance ? 'animate-pulse' : ''}
            `}
          >
            ✅ Done
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SessionFeedback;
