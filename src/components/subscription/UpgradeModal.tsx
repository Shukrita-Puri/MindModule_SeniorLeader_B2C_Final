import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import appLogo from "@/assets/app-logo-4.png";
import { isIosNativeShell } from "@/config/purchasePlatform";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAccountDialog } from "@/components/profile/DeleteAccountDialog";
import { supabase } from '@/integrations/supabase/client';

interface UpgradeModalProps {
  sessionsRemaining: number;
  onClose: () => void;
}

type ViewState = 'default' | 'feedback' | 'account-options';

export function UpgradeModal({ sessionsRemaining, onClose }: UpgradeModalProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [view, setView] = useState<ViewState>('default');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const features = [
    'Unlimited coach conversations',
    'Full AI insights across all cards',
    'Weekly pattern summary',
    'Unlimited history & data export',
  ];

  const handleFeedback = async (reason: string) => {
    try {
      await supabase.from('churn_feedback').insert({ 
        reason,
        user_id: user?.id
      });
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
    setView('account-options');
  };

  const renderFeedback = () => (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h3 className="text-lg font-headline font-bold">Help us improve</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Could you share why you're not interested in upgrading?
        </p>
      </div>
      <div className="space-y-2">
        {['Too expensive', 'Missing features', 'Not useful for me', 'Just exploring'].map((reason) => (
          <Button
            key={reason}
            variant="outline"
            className="w-full justify-start text-left font-normal"
            onClick={() => handleFeedback(reason)}
          >
            {reason}
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setView('account-options')}>
        Skip
      </Button>
    </div>
  );

  const renderAccountOptions = () => (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-headline font-bold">Your Trial is Over</h3>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          You can keep your account if you change your mind later, or delete your account and all associated data permanently.
        </p>
      </div>
      <div className="space-y-3">
        <Button
          className="w-full"
          variant="outline"
          onClick={() => void signOut()}
        >
          Sign Out
        </Button>
        <Button
          className="w-full"
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          Delete Account
        </Button>
      </div>
      
      {showDeleteDialog && (
        <DeleteAccountDialog 
          open={showDeleteDialog} 
          onOpenChange={setShowDeleteDialog} 
        />
      )}
    </div>
  );

  const renderDefault = () => (
    <div className="space-y-5 animate-fade-in">
      {/* Brand header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={appLogo} alt="Mind Module" className="w-10 h-10 rounded-xl" />
          <div>
            <p className="text-sm font-headline font-bold leading-tight">Mind Module</p>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Executive Edition</p>
          </div>
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
            : 'Upgrade to Pro for unlimited access'}
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
          onClick={() => navigate('/upgrade?source=coach-upgrade', { state: { source: 'coach_upgrade' } })}
        >
          {/* On iOS this routes to the in-app Apple IAP paywall, never to
              an external Stripe checkout (Guideline 3.1.1). */}
          {isIosNativeShell() ? 'Subscribe to Mind Module Pro' : 'Upgrade to Mind Module Pro'}
        </Button>
        {sessionsRemaining > 0 ? (
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Not now
          </Button>
        ) : (
          <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setView('feedback')}>
            Not interested
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl max-w-sm w-full p-6 relative">
        {view === 'default' && renderDefault()}
        {view === 'feedback' && renderFeedback()}
        {view === 'account-options' && renderAccountOptions()}
      </div>
    </div>
  );
}
