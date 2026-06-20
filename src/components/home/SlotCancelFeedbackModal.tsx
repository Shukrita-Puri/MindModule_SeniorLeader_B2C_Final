import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * SlotCancelFeedbackModal — glass-style "Not Relevant" capture for a
 * cancelled Today priority slot. Mirrors PlanFeedbackModal styling so the
 * relevance-feedback flow lives inside the same visual language as plan
 * completion feedback. Pure UI: the parent owns persistence.
 */

export type CancelReason = "cancelled_now" | "never";

interface SlotCancelFeedbackModalProps {
  priorityNumber: number;
  slotTitle?: string;
  onSubmit: (reason: CancelReason, feedback?: string) => void;
  onSkip: () => void;
}

const REASONS: Array<{ value: CancelReason; label: string; hint: string }> = [
  { value: "cancelled_now", label: "Not relevant now", hint: "Skip for today" },
  { value: "never", label: "Not relevant ever", hint: "Stop suggesting this" },
];

const SlotCancelFeedbackModal = ({
  priorityNumber,
  slotTitle,
  onSubmit,
  onSkip,
}: SlotCancelFeedbackModalProps) => {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [feedback, setFeedback] = useState("");

  const handleSubmit = () => {
    if (!reason) return;
    onSubmit(reason, feedback.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto bg-black/55 backdrop-blur-xl border border-white/30 shadow-2xl">
        <div className="px-5 pt-5 pb-2 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/80 font-body font-medium">
            Priority {priorityNumber}
          </p>
          <h2 className="text-[22px] md:text-[26px] font-headline tracking-tight text-white">
            Cancel this priority?
          </h2>
          {slotTitle && (
            <p className="text-sm text-white/85 line-clamp-2">{slotTitle}</p>
          )}
        </div>

        <div className="px-5 pb-5 pt-1 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-white">Why are you cancelling?</p>
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
                        ? "border-taupe bg-taupe/30 text-white shadow-[0_0_0_3px_hsl(var(--taupe)/0.25)]"
                        : "border-white/40 bg-white/10 text-white hover:bg-white/20 hover:border-white/60",
                    )}
                  >
                    <p className="text-sm font-medium leading-tight text-white">{label}</p>
                    <p className="text-[11px] text-white/75 mt-0.5">{hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-white">
              Anything we should know? <span className="text-xs text-white/70">(optional)</span>
            </p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What would have been more useful?"
              maxLength={300}
              className="min-h-[80px] text-sm resize-none bg-white/10 border-white/30 text-white placeholder:text-white/60 focus-visible:ring-taupe/40"
            />
            <p className="text-xs text-right text-white/70">{feedback.length}/300</p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 text-sm text-white hover:text-white hover:bg-white/15"
              onClick={onSkip}
            >
              Keep it
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!reason}
              className="flex-1 text-sm bg-taupe hover:bg-taupe-rich text-taupe-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reason ? "Save cancel" : "Choose a reason"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlotCancelFeedbackModal;
