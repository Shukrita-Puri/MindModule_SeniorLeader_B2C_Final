import { Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeModalProps {
  sessionsRemaining: number;
  onClose: () => void;
}

export function UpgradeModal({ sessionsRemaining, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();

  const features = [
    'Unlimited coach conversations',
    'Full AI insights across all cards',
    'Weekly pattern summary',
    'Unlimited history & data export',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl max-w-sm w-full p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare size={24} className="text-primary" />
          </div>
          {sessionsRemaining > 0 && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={20} />
            </button>
          )}
        </div>

        <div>
          <h3 className="text-lg font-headline font-bold">
            {sessionsRemaining > 0
              ? `${sessionsRemaining} Sessions Remaining`
              : 'Trial Limit Reached'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {sessionsRemaining > 0
              ? `You've used ${10 - sessionsRemaining} of 10 trial conversations. Upgrade for unlimited AI coaching.`
              : 'Upgrade to Pro for unlimited coach conversations and full AI insights.'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">With Pro you get:</p>
          <ul className="space-y-1.5">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Check size={14} className="text-primary flex-shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full"
            variant="critical"
            onClick={() => navigate('/onboarding/payment')}
          >
            Upgrade to Pro — $29/mo
          </Button>
          {sessionsRemaining > 0 && (
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Not now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
