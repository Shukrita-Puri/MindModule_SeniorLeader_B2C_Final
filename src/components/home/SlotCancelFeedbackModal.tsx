import { useState } from "react";
import { cn } from "@/lib/utils";
import FeedbackCapture, { type FeedbackRating } from "@/components/feedback/FeedbackCapture";

/**
 * SlotCancelFeedbackModal — glass-style "Not Relevant" capture for a
 * cancelled Today priority slot. Mirrors PlanFeedbackModal styling so the
 * relevance-feedback flow lives inside the same visual language as plan
 * completion feedback. Pure UI: the parent owns persistence.
 */

export type CancelReason = "now" | "ever";

interface SlotCancelFeedbackModalProps {
  priorityNumber: number;
  slotTitle?: string;
  onSubmit: (reason: CancelReason, feedback?: string) => void;
  onSkip: () => void;
}

const REASONS: Array<{ value: CancelReason; label: string; hint: string }> = [
  { value: "now", label: "Not relevant now", hint: "Skip for today" },
  { value: "ever", label: "Not relevant ever", hint: "Stop suggesting this" },
];

const SlotCancelFeedbackModal = ({
  priorityNumber,
  slotTitle,
  onSubmit,
  onSkip,
}: SlotCancelFeedbackModalProps) => {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [rating, setRating] = useState<FeedbackRating | null>("down");
  const [feedback, setFeedback] = useState("");

  const handleSubmit = () => {
    if (!reason) return;
    onSubmit(reason, feedback.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto bg-white/15 backdrop-blur-md border border-white/40 shadow-xl">
        <div className="px-5 pt-5 pb-2 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/60 font-body font-medium">
            Priority {priorityNumber}
          </p>
          <h2 className="text-[22px] md:text-[26px] font-headline tracking-tight text-white">
            Cancel this priority?
          </h2>
          {slotTitle && (
            <p className="text-sm text-white/70 line-clamp-2">{slotTitle}</p>
          )}
        </div>

        <div className="px-5 pb-5 pt-1 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-white/80">Why are you cancelling?</p>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(({ value, label, hint }) => {
                const isActive = reason === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReason(value)}
                    aria-pressed={isActive}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-left transition-all",
                      isActive
                        ? "border-taupe bg-taupe/20 text-white shadow-[0_0_0_3px_hsl(var(--taupe)/0.20)]"
                        : "border-white/25 bg-white/10 text-white/80 hover:text-white hover:border-white/40",
                    )}
                  >
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-[11px] text-white/55 mt-0.5">{hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <FeedbackCapture
            variant="glass"
            hideRatingPrompt
            rating={rating}
            onRatingChange={setRating}
            feedback={feedback}
            onFeedbackChange={setFeedback}
            onSubmit={handleSubmit}
            onCancel={onSkip}
            feedbackPrompt="Anything we should know?"
            positivePlaceholder="What would have been more useful?"
            negativePlaceholder="What would have been more useful?"
            submitLabel={reason ? "Cancel priority" : "Choose a reason"}
            cancelLabel="Keep it"
            maxLength={300}
          />
        </div>
      </div>
    </div>
  );
};

export default SlotCancelFeedbackModal;