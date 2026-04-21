import { useState } from "react";
import { Check } from "lucide-react";
import FeedbackCapture, { type FeedbackRating } from "@/components/feedback/FeedbackCapture";

interface PlanFeedbackModalProps {
  planType: "tod" | "jit";
  energyTier?: string;
  priorityNumber?: number;
  priorityLabel?: string;
  /**
   * Numeric rating preserved for backwards compatibility with existing analytics:
   * up → 5, neutral → 3, down → 1.
   */
  onSubmit: (rating: number, feedback?: string) => void;
  onSkip: () => void;
}

const RATING_TO_NUMERIC: Record<FeedbackRating, number> = {
  up: 5,
  neutral: 3,
  down: 1,
};

const PlanFeedbackModal = ({
  planType,
  energyTier,
  priorityNumber,
  priorityLabel,
  onSubmit,
  onSkip,
}: PlanFeedbackModalProps) => {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isRecoveryState = energyTier === "depleted" || energyTier === "managing";

  const positivePlaceholder = isRecoveryState
    ? "Any shifts you noticed?"
    : "What's helping you stay ready?";

  const negativePlaceholder = isRecoveryState
    ? "What still feels off?"
    : "What got in the way?";

  const title = priorityLabel
    ? `${priorityLabel} Complete`
    : planType === "jit" ? "Pre-Event Preparation Complete" : "Plan Complete";

  const handleSubmit = () => {
    if (!rating) return;
    setShowConfirmation(true);
    setTimeout(() => {
      onSubmit(RATING_TO_NUMERIC[rating], feedback.trim() || undefined);
    }, 1400);
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="relative bg-background/95 backdrop-blur-md rounded-2xl p-8 max-w-sm w-full text-center animate-in fade-in zoom-in duration-500 border border-border shadow-2xl">
          <div className="relative mb-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Check className="w-8 h-8 text-primary" strokeWidth={3} />
            </div>
          </div>
          <h3 className="text-lg font-headline text-foreground mb-2">
            Feedback Received
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your input helps calibrate future plans to your needs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background/95 backdrop-blur-md rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-border shadow-2xl">
        <div className="px-5 pt-5 pb-3 space-y-1">
          <h2 className="text-[15px] md:text-[20px] font-medium tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground animate-in fade-in duration-700">
            How did this plan work for you?
          </p>
        </div>

        <div className="px-5 pb-5 pt-1">
          <FeedbackCapture
            rating={rating}
            onRatingChange={setRating}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onSubmit={handleSubmit}
            onCancel={onSkip}
            ratingPrompt="Rate your experience"
            positivePlaceholder={positivePlaceholder}
            negativePlaceholder={negativePlaceholder}
            submitLabel="Submit"
            cancelLabel="Skip"
            maxLength={300}
          />
        </div>
      </div>
    </div>
  );
};

export default PlanFeedbackModal;
