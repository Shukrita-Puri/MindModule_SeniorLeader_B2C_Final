
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

const betterNextTimePlaceholders = [
  "More specific examples",
  "Deeper analysis",
  "Sharper emotional lens"
];

const discussNextTimePlaceholders = [
  "Follow-up on today's insights",
  "New challenges",
  "Continue this thread"
];

const SessionFeedback = ({ onSubmit, onSkip }: SessionFeedbackProps) => {
  const [resonance, setResonance] = useState<ResonanceType | null>(null);
  const [betterNextTime, setBetterNextTime] = useState("");
  const [discussNextTime, setDiscussNextTime] = useState("");
  const [currentBetterPlaceholder, setCurrentBetterPlaceholder] = useState(0);
  const [currentDiscussPlaceholder, setCurrentDiscussPlaceholder] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Rotate placeholders
  useEffect(() => {
    const betterInterval = setInterval(() => {
      setCurrentBetterPlaceholder((prev) => (prev + 1) % betterNextTimePlaceholders.length);
    }, 3000);
    const discussInterval = setInterval(() => {
      setCurrentDiscussPlaceholder((prev) => (prev + 1) % discussNextTimePlaceholders.length);
    }, 3500);
    return () => {
      clearInterval(betterInterval);
      clearInterval(discussInterval);
    };
  }, []);

  const handleResonanceSelect = (id: ResonanceType) => {
    setResonance(id);
  };

  const handleSubmit = () => {
    if (resonance) {
      setShowConfirmation(true);
      setTimeout(() => {
        onSubmit({
          resonance,
          deeperFocus: betterNextTime || undefined,
          nextSessionFocus: discussNextTime ? [discussNextTime] : undefined
        });
      }, 2000);
    }
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-[hsl(var(--gold))]/5 via-background/95 to-background/90 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full text-center animate-in fade-in zoom-in duration-300 border border-[hsl(var(--gold))]/10">
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
      <div className="bg-gradient-to-br from-[hsl(var(--gold))]/8 via-background/98 to-muted/30 backdrop-blur-md rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-[hsl(var(--gold))]/25 shadow-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Dialogue Reflection</h2>
          <p className="text-xs text-muted-foreground animate-in fade-in duration-700">
            Take 5 seconds to tune the next conversation.
          </p>
        </div>

        {/* Core Feedback */}
        <div className="px-5 pb-4 space-y-2.5">
          <p className="text-sm text-foreground/80">How did this dialogue land for you?</p>
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

        {/* Question 2 */}
        <div className="px-5 pb-3 space-y-1.5">
          <p className="text-sm text-foreground/80">What could be better next time? <span className="text-xs text-muted-foreground">(optional)</span></p>
          <Textarea
            value={betterNextTime}
            onChange={(e) => setBetterNextTime(e.target.value)}
            placeholder={betterNextTimePlaceholders[currentBetterPlaceholder]}
            className="min-h-[45px] text-sm resize-none transition-all duration-300"
          />
        </div>

        {/* Question 3 */}
        <div className="px-5 pb-4 space-y-1.5">
          <p className="text-sm text-foreground/80">What would you like to discuss next time? <span className="text-xs text-muted-foreground">(optional)</span></p>
          <Textarea
            value={discussNextTime}
            onChange={(e) => setDiscussNextTime(e.target.value)}
            placeholder={discussNextTimePlaceholders[currentDiscussPlaceholder]}
            className="min-h-[45px] text-sm resize-none transition-all duration-300"
          />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
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
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SessionFeedback;
