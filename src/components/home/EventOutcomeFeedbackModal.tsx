import { useState } from "react";
import { Check } from "lucide-react";
import FeedbackCapture, { type FeedbackRating } from "@/components/feedback/FeedbackCapture";
import { EVENT_CATEGORY_NAMES, type EventCategoryId } from "@/lib/events/categories";

interface EventOutcomeFeedbackModalProps {
  title: string | null;
  categoryId: string;
  onSubmit: (rating: number, feedback?: string) => void;
  onSkip: () => void;
}

const RATING_TO_NUMERIC: Record<FeedbackRating, number> = {
  up: 5,
  neutral: 3,
  down: 1,
};

const EventOutcomeFeedbackModal = ({
  title,
  categoryId,
  onSubmit,
  onSkip,
}: EventOutcomeFeedbackModalProps) => {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const categoryLabel =
    EVENT_CATEGORY_NAMES[categoryId as EventCategoryId] ?? null;

  const handleSubmit = () => {
    if (!rating) return;
    setShowConfirmation(true);
    setTimeout(() => {
      onSubmit(RATING_TO_NUMERIC[rating], feedback.trim() || undefined);
    }, 1400);
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="relative rounded-3xl p-8 max-w-sm w-full text-center animate-in fade-in zoom-in duration-500 bg-black/55 backdrop-blur-xl border border-white/30 shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-taupe/20 flex items-center justify-center border border-taupe/40">
            <Check className="w-8 h-8 text-taupe-foreground" strokeWidth={3} />
          </div>
          <h3 className="text-lg font-headline text-white mb-2">Noted</h3>
          <p className="text-sm text-white/85 leading-relaxed">
            This sharpens how your preparation is tuned for demanding days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto bg-black/55 backdrop-blur-xl border border-white/30 shadow-2xl">
        <div className="px-5 pt-5 pb-2 space-y-1.5">
          <h2 className="text-[22px] md:text-[26px] font-headline tracking-tight text-white">
            How did that go?
          </h2>
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/80 font-body font-medium">
            {title || categoryLabel || "Recent high-demand event"}
          </p>
        </div>

        <div className="px-5 pb-5 pt-1">
          <FeedbackCapture
            variant="glass"
            hideRatingPrompt
            rating={rating}
            onRatingChange={setRating}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onSubmit={handleSubmit}
            onCancel={onSkip}
            positivePlaceholder="What held up well?"
            negativePlaceholder="What made it harder than it needed to be?"
            submitLabel="Submit"
            cancelLabel="Skip"
            maxLength={300}
          />
        </div>
      </div>
    </div>
  );
};

export default EventOutcomeFeedbackModal;
