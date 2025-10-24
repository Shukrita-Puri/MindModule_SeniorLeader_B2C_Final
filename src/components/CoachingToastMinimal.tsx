import { useState, useEffect } from "react";
import { Brain, ChevronDown, ChevronUp, Target } from "lucide-react";

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
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-dismiss after 8 seconds if not expanded
  useEffect(() => {
    if (!isExpanded) {
      const timer = setTimeout(onClose, 8000);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, onClose]);

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-slide-down">
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border p-4 max-w-md mx-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Brain size={16} className="text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground mb-1">
              {feedback.message}
            </p>
            
            {isExpanded && (
              <div className="space-y-2 text-xs text-muted-foreground animate-fade-in">
                <p className="italic">💡 {feedback.suggestion}</p>
                {feedback.pastLearning && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="font-medium flex items-center gap-1">
                      <Target size={12} />
                      Past Learning:
                    </p>
                    <p className="mt-1 opacity-70 italic">{feedback.pastLearning.context}</p>
                    <p className="mt-1">{feedback.pastLearning.insight}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoachingToastMinimal;
