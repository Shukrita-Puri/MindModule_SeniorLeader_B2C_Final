import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/services/authTokenService";

interface CancellationFlowProps {
  onClose: () => void;
  onCanceled: (endsAt: string) => void;
}

const cancelReasons = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'not_using', label: 'Not using it enough' },
  { value: 'missing_features', label: 'Missing features I need' },
  { value: 'found_alternative', label: 'Found an alternative' },
  { value: 'other', label: 'Other reason' },
];

export function CancellationFlow({ onClose, onCanceled }: CancellationFlowProps) {
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showRetention, setShowRetention] = useState(false);

  const handleReasonSelect = (r: string) => {
    setReason(r);
    if (r === 'too_expensive' || r === 'not_using') {
      setShowRetention(true);
    } else {
      setShowRetention(false);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const headers = await getAuthHeaders();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/cancel-subscription`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, immediate: false }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onCanceled(data.endsAt);
    } catch (err: any) {
      console.error('[CancellationFlow] Error:', err?.message || err);
      alert('Cancellation failed. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl max-w-sm w-full p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-headline font-bold">Before you go...</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">Help us understand why you're canceling</p>

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
                onChange={() => handleReasonSelect(r.value)}
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

        {/* Retention Offer */}
        {showRetention && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-primary flex-shrink-0 mt-0.5" />
              {reason === 'too_expensive' ? (
                <div>
                  <p className="text-sm font-semibold">Would $24/month work better?</p>
                  <p className="text-xs text-muted-foreground">
                    Switch to Annual ($289/year) and save 17%.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold">Pause for 30 days instead?</p>
                  <p className="text-xs text-muted-foreground">
                    No charge for 30 days. Keep all your data.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {reason && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleConfirmCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Canceling...' : 'Cancel Anyway'}
            </Button>
            <Button variant="critical" className="flex-1" onClick={onClose}>
              Keep Subscription
            </Button>
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Your access continues until the end of your billing period
        </p>
      </div>
    </div>
  );
}
