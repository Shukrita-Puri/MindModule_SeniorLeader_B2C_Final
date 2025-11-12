import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";

interface PracticeRatingModalProps {
  contentId: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  contentTitle: string;
  category: string;
  sessionId?: string;
  onSubmit: (rating: number, feedback?: string) => void;
  onSkip: () => void;
}

const PracticeRatingModal = ({
  contentId,
  contentType,
  contentTitle,
  category,
  sessionId,
  onSubmit,
  onSkip
}: PracticeRatingModalProps) => {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleStarClick = (starRating: number) => {
    setRating(starRating);
  };

  const handleSubmit = () => {
    if (rating) {
      setShowConfirmation(true);
      setTimeout(() => {
        onSubmit(rating, feedback || undefined);
      }, 2000);
    }
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-[hsl(var(--gold))]/5 via-background/95 to-background/90 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full text-center animate-in fade-in zoom-in duration-300 border border-[hsl(var(--gold))]/10">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-sm text-muted-foreground">
            Rating saved! Your feedback helps us personalize your experience.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background/95 backdrop-blur-md rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-border shadow-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 space-y-1">
          <h2 className="text-lg md:text-xl font-semibold tracking-tight">How was this practice?</h2>
          <p className="text-xs text-muted-foreground animate-in fade-in duration-700">
            {contentTitle}
          </p>
        </div>

        {/* Star Rating */}
        <div className="px-5 pb-4 space-y-3">
          <p className="text-sm text-foreground/80">Rate your experience</p>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const isActive = rating !== null && star <= rating;
              const isHovered = hoveredRating !== null && star <= hoveredRating;
              
              return (
                <button
                  key={star}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(null)}
                  className="transition-all duration-200 hover:scale-110 active:scale-95"
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star
                    size={36}
                    className={`transition-all duration-200 ${
                      isActive || isHovered
                        ? 'fill-[hsl(var(--gold))] stroke-[hsl(var(--gold))] drop-shadow-[0_0_8px_hsl(var(--gold)/0.5)]'
                        : 'fill-none stroke-muted-foreground'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          {rating && (
            <p className="text-center text-xs text-muted-foreground animate-in fade-in duration-300">
              {rating} out of 5 stars
            </p>
          )}
        </div>

        {/* Optional Feedback */}
        {rating && (
          <div className="px-5 pb-4 space-y-2 animate-in slide-in-from-top duration-300">
            <p className="text-sm text-foreground/80">
              What made this practice helpful? <span className="text-xs text-muted-foreground">(optional)</span>
            </p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Share your experience..."
              maxLength={200}
              className="min-h-[60px] text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {feedback.length}/200
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <Button
            onClick={onSkip}
            variant="ghost"
            className="flex-1 text-sm"
          >
            Skip for now
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!rating}
            className={`
              flex-1 text-sm bg-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/90 text-gold-foreground
              disabled:opacity-50 disabled:cursor-not-allowed
              ${rating ? 'shadow-[0_0_20px_hsl(var(--gold))/30]' : ''}
            `}
          >
            Submit Rating
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PracticeRatingModal;
