
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Lightbulb, Target, Zap, HelpCircle, X as XIcon, Repeat, Puzzle, Feather, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth0 } from "@auth0/auth0-react";

interface SessionFeedbackProps {
  sessionType?: string;
  sessionId?: string | null;
  onSubmit: (feedback: {
    resonance: 'loved' | 'clarifying' | 'insightful' | 'aha' | 'unclear' | 'missed';
    deeperFocus?: string;
    nextSessionFocus?: string[];
  }) => void;
  onSkip: () => void;
}

type ResonanceType = 'loved' | 'clarifying' | 'insightful' | 'aha' | 'unclear' | 'missed';

const resonanceOptions = [
  { id: 'loved' as ResonanceType, label: 'Loved it', icon: Heart },
  { id: 'clarifying' as ResonanceType, label: 'Clarifying', icon: Lightbulb },
  { id: 'insightful' as ResonanceType, label: 'Insightful', icon: Target },
  { id: 'aha' as ResonanceType, label: 'Aha!', icon: Zap },
  { id: 'unclear' as ResonanceType, label: 'Unclear', icon: HelpCircle },
  { id: 'missed' as ResonanceType, label: 'Missed the Mark', icon: XIcon },
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

const SessionFeedback = ({ sessionId, onSubmit, onSkip }: SessionFeedbackProps) => {
  const { user } = useAuth0();
  const [resonance, setResonance] = useState<ResonanceType | null>(null);
  const [betterNextTime, setBetterNextTime] = useState("");
  const [discussNextTime, setDiscussNextTime] = useState("");
  const [currentBetterPlaceholder, setCurrentBetterPlaceholder] = useState(0);
  const [currentDiscussPlaceholder, setCurrentDiscussPlaceholder] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSubmit = async () => {
    if (!resonance) return;
    
    setIsSaving(true);
    
    try {
      // Save feedback to database
      const feedbackData = {
        user_id: user?.sub || 'anonymous',
        session_id: sessionId || null,
        resonance,
        deeper_focus: betterNextTime || null,
        next_session_focus: discussNextTime ? [discussNextTime] : null
      };

      const { error } = await supabase
        .from('session_feedback')
        .insert(feedbackData);

      if (error) {
        console.error('Error saving feedback:', error);
      }

      setShowConfirmation(true);
      setTimeout(() => {
        onSubmit({
          resonance,
          deeperFocus: betterNextTime || undefined,
          nextSessionFocus: discussNextTime ? [discussNextTime] : undefined
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to save feedback:', err);
      // Still show confirmation and proceed even if save fails
      setShowConfirmation(true);
      setTimeout(() => {
        onSubmit({
          resonance,
          deeperFocus: betterNextTime || undefined,
          nextSessionFocus: discussNextTime ? [discussNextTime] : undefined
        });
      }, 2000);
    } finally {
      setIsSaving(false);
    }
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-taupe/10 via-card to-card/95 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full text-center animate-in fade-in zoom-in duration-300 border border-taupe/20 shadow-lg">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-taupe-highlight to-taupe flex items-center justify-center">
            <Lightbulb className="w-6 h-6 text-taupe-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Reflection saved. Your input sharpens future calibrations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card/95 backdrop-blur-md rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-border shadow-2xl">
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
                      ? 'border-taupe bg-taupe/10 shadow-[0_0_20px_hsl(var(--taupe)/0.3)]' 
                      : 'border-border hover:border-taupe/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <Icon 
                    size={18} 
                    className={isSelected ? 'text-taupe-rich' : 'text-muted-foreground'}
                  />
                  <span className={`text-xs ${isSelected ? 'text-taupe-rich font-medium' : 'text-muted-foreground'}`}>
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
            disabled={!resonance || isSaving}
            className={`
              flex-1 text-sm bg-taupe hover:bg-taupe-rich text-taupe-foreground
              ${resonance && !isSaving ? 'animate-pulse' : ''}
            `}
          >
            {isSaving ? 'Saving...' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SessionFeedback;
