import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAuthHeaders } from "@/services/authTokenService";
import { toast } from "sonner";

interface CancellationFlowProps {
  onClose: () => void;
  onCanceled: (endsAt: string) => void;
}

const cancelReasons = [
  { value: 'technical_issues', label: 'I am having too many technical issues' },
  { value: 'too_expensive', label: "It's too expensive" },
  { value: 'not_using', label: "I'm not using MindModule enough" },
  { value: 'missing_features', label: "It's missing features" },
  { value: 'switched_competitor', label: 'I switched to a competitor' },
  { value: 'other', label: 'Other reason' },
];

export function CancellationFlow({ onClose, onCanceled }: CancellationFlowProps) {
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const handleConfirmCancel = async () => {
    if (!reason) return;
    setCancelling(true);
    try {
      const headers = await getAuthHeaders();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/cancel-subscription`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            reason, 
            reasonDetails: feedback.trim() || null,
            immediate: false 
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onCanceled(data.endsAt);
    } catch (err: any) {
      console.error('[CancellationFlow] Error:', err?.message || err);
      toast.error('Cancellation failed. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl max-w-md w-full p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-headline font-bold">Why are you downgrading?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              We use this information to improve our product.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Reason Selection */}
        <div className="space-y-2">
          {cancelReasons.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                reason === r.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                reason === r.value ? 'border-primary' : 'border-muted-foreground/40'
              }`}>
                {reason === r.value && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>

        {/* Optional Feedback Textarea */}
        <div className="space-y-2">
          <Textarea
            placeholder="Tell us more about your decision... (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="resize-none min-h-[80px]"
            maxLength={500}
          />
        </div>

        {/* Actions - Retention First Pattern */}
        <div className="space-y-2 pt-2">
          <Button className="w-full" onClick={onClose}>
            Keep current plan
          </Button>
          <Button
            variant="outline"
            className="w-full text-muted-foreground"
            onClick={handleConfirmCancel}
            disabled={cancelling || !reason}
          >
            {cancelling ? 'Canceling...' : 'Cancel plan'}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Your access continues until the end of your billing period
        </p>
      </div>
    </div>
  );
}
