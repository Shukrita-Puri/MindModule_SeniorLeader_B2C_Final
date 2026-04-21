import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import FeedbackCapture, { type FeedbackRating } from "@/components/feedback/FeedbackCapture";

interface PracticeRatingModalProps {
  contentId: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  contentTitle: string;
  category: string;
  sessionId?: string;
  alreadyRated?: boolean;
  onSubmit: (rating: number, feedback?: string) => void;
  onSkip: () => void;
}

const RATING_TO_NUMERIC: Record<FeedbackRating, number> = {
  up: 5,
  neutral: 3,
  down: 1,
};

const PracticeRatingModal = ({
  contentId,
  contentType,
  contentTitle,
  category,
  sessionId,
  alreadyRated,
  onSubmit,
  onSkip
}: PracticeRatingModalProps) => {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Auto-skip if already rated
  useEffect(() => {
    if (alreadyRated) {
      onSkip();
    }
  }, [alreadyRated]);

  const handleSubmit = () => {
    if (!rating) return;
    setShowConfirmation(true);
    setTimeout(() => {
      onSubmit(RATING_TO_NUMERIC[rating], feedback.trim() || undefined);
    }, 2000);
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="relative rounded-3xl p-8 max-w-sm w-full text-center animate-in fade-in zoom-in duration-500 bg-white/15 backdrop-blur-md border border-white/40 shadow-xl">
          <div className="relative mb-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-taupe/20 flex items-center justify-center border border-taupe/40">
              <Check className="w-8 h-8 text-taupe-foreground" strokeWidth={3} />
            </div>
          </div>
          <h3 className="text-lg font-headline text-white mb-2">
            Feedback Received
          </h3>
          <p className="text-sm text-white/70 leading-relaxed">
            Your input helps us personalize your experience and recommend practices that work for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto bg-white/15 backdrop-blur-md border border-white/40 shadow-xl">
        <div className="px-6 md:px-8 pt-6 md:pt-8 pb-3 space-y-1">
          <h2 className="text-[15px] md:text-[20px] font-medium tracking-tight text-white">
            How was this practice?
          </h2>
          <p className="text-xs text-white/60 animate-in fade-in duration-700">
            {contentTitle}
          </p>
        </div>

        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-1">
          <FeedbackCapture
            variant="glass"
            rating={rating}
            onRatingChange={setRating}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onSubmit={handleSubmit}
            onCancel={onSkip}
            ratingPrompt="Rate your experience"
            positivePlaceholder="What made this practice helpful?"
            negativePlaceholder="What got in the way?"
            submitLabel="Submit"
            cancelLabel="Skip"
            maxLength={300}
          />
        </div>
      </div>
    </div>
  );
};

export default PracticeRatingModal;
