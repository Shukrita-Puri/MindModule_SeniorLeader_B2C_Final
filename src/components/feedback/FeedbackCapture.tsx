/**
 * FeedbackCapture — unified in-app feedback control
 * Three-state rating (👍 / ⚌ / 👎) plus optional open-ended textarea.
 * Replaces the legacy 1–5 star pattern across the app (PlanFeedback, brief rating, etc.)
 * so leaders give feedback with one binary judgement plus optional voice.
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, Equal } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackRating = "up" | "neutral" | "down";

interface FeedbackCaptureProps {
  rating: FeedbackRating | null;
  onRatingChange: (rating: FeedbackRating) => void;
  feedback: string;
  onFeedbackChange: (feedback: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  /** Optional override for the rating prompt above the icons */
  ratingPrompt?: string;
  /** Optional override for the textarea label */
  feedbackPrompt?: string;
  /** Override placeholder text used when rating is up/neutral */
  positivePlaceholder?: string;
  /** Override placeholder text used when rating is down */
  negativePlaceholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  /** Disable submit (e.g. while saving) */
  isSubmitting?: boolean;
  maxLength?: number;
}

const ICONS: Array<{ value: FeedbackRating; Icon: typeof ThumbsUp; label: string }> = [
  { value: "up", Icon: ThumbsUp, label: "Useful" },
  { value: "neutral", Icon: Equal, label: "Neutral" },
  { value: "down", Icon: ThumbsDown, label: "Off" },
];

const FeedbackCapture = ({
  rating,
  onRatingChange,
  feedback,
  onFeedbackChange,
  onSubmit,
  onCancel,
  ratingPrompt = "How was this for you?",
  feedbackPrompt,
  positivePlaceholder = "What was useful?",
  negativePlaceholder = "What was off?",
  submitLabel = "Submit",
  cancelLabel = "Skip",
  isSubmitting = false,
  maxLength = 500,
}: FeedbackCaptureProps) => {
  const placeholder = useMemo(() => {
    if (rating === "down") return negativePlaceholder;
    return positivePlaceholder;
  }, [rating, positivePlaceholder, negativePlaceholder]);

  const resolvedFeedbackPrompt =
    feedbackPrompt ??
    (rating === "down" ? "What didn't land?" : "Anything to add?");

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm text-foreground/80">{ratingPrompt}</p>
        <div className="flex items-center justify-center gap-3">
          {ICONS.map(({ value, Icon, label }) => {
            const isActive = rating === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onRatingChange(value)}
                aria-label={label}
                aria-pressed={isActive}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200",
                  "hover:scale-105 active:scale-95",
                  isActive
                    ? "border-gold bg-gold/10 text-gold shadow-[0_0_0_3px_hsl(var(--gold)/0.15)]"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon size={20} strokeWidth={2} />
              </button>
            );
          })}
        </div>
      </div>

      {rating && (
        <div className="space-y-2 animate-in slide-in-from-top-1 duration-300">
          <p className="text-sm text-foreground/80">
            {resolvedFeedbackPrompt}{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
          </p>
          <Textarea
            value={feedback}
            onChange={(e) => onFeedbackChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className="min-h-[80px] text-sm resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">
            {feedback.length}/{maxLength}
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className="flex-1 text-sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!rating || isSubmitting}
          className="flex-1 text-sm bg-[hsl(var(--gold))] hover:bg-[hsl(var(--gold))]/90 text-gold-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
};

export default FeedbackCapture;