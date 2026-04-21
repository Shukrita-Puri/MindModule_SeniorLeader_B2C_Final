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
  /**
   * Visual variant.
   * - "default": light surface, standard borders
   * - "glass":   light text on dark/glass surfaces (Reset Studio + plan completion)
   */
  variant?: "default" | "glass";
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
  variant = "default",
}: FeedbackCaptureProps) => {
  const placeholder = useMemo(() => {
    if (rating === "down") return negativePlaceholder;
    return positivePlaceholder;
  }, [rating, positivePlaceholder, negativePlaceholder]);

  const resolvedFeedbackPrompt =
    feedbackPrompt ??
    (rating === "down" ? "What didn't land?" : "Anything to add?");

  const isGlass = variant === "glass";

  const promptClass = isGlass ? "text-white/80" : "text-foreground/80";
  const hintClass = isGlass ? "text-white/50" : "text-muted-foreground";
  const counterClass = isGlass ? "text-white/50" : "text-muted-foreground";

  const inactiveIconClass = isGlass
    ? "border-white/30 bg-white/10 text-white/60 hover:text-white hover:border-white/50"
    : "border-border bg-background text-muted-foreground hover:text-foreground";

  const activeIconClass =
    "border-taupe bg-taupe/15 text-taupe-foreground shadow-[0_0_0_3px_hsl(var(--taupe)/0.20)]";

  const textareaClass = isGlass
    ? "min-h-[80px] text-sm resize-none bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-taupe/40"
    : "min-h-[80px] text-sm resize-none";

  const cancelClass = isGlass
    ? "flex-1 text-sm text-white/70 hover:text-white hover:bg-white/10"
    : "flex-1 text-sm";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className={cn("text-sm", promptClass)}>{ratingPrompt}</p>
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
                  isActive ? activeIconClass : inactiveIconClass
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
          <p className={cn("text-sm", promptClass)}>
            {resolvedFeedbackPrompt}{" "}
            <span className={cn("text-xs", hintClass)}>(optional)</span>
          </p>
          <Textarea
            value={feedback}
            onChange={(e) => onFeedbackChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={textareaClass}
          />
          <p className={cn("text-xs text-right", counterClass)}>
            {feedback.length}/{maxLength}
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className={cancelClass}
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
          className="flex-1 text-sm bg-taupe hover:bg-taupe-rich text-taupe-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
};

export default FeedbackCapture;