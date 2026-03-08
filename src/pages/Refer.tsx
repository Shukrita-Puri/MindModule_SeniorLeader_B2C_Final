import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Copy, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';
import giftBoxImg from '@/assets/referral-gift-box.png';
import mmLogoMini from '@/assets/mm-logo-mini.png';

const Refer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');
  const [signedUpCount, setSignedUpCount] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    const fetchReferralData = async () => {
      try {
        const token = await getAuthToken();
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/generate-referral-link`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setReferralLink(data.referral_link || '');
          setSignedUpCount(data.total_signups || 0);
          setConvertedCount(data.total_conversions || 0);
        }
      } catch (err) {
        console.error('[Refer] Failed to fetch referral data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReferralData();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 safe-area-top bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-headline font-semibold text-foreground">Refer Friends</h1>
            <p className="text-sm text-muted-foreground font-body">Share the mental edge</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero Section — Gift box overflows right */}
        <div className="relative rounded-2xl border border-saffron/20 bg-gradient-to-br from-saffron/10 via-gold/5 to-background overflow-hidden shadow-[0_8px_32px_rgba(245,158,11,0.08)]">
          {/* Gift box — positioned to overflow right, only ~60% visible */}
          <img
            src={giftBoxImg}
            alt="Referral gift box"
            className="absolute -right-16 -top-4 w-56 h-56 sm:w-64 sm:h-64 object-contain pointer-events-none opacity-90 drop-shadow-lg"
          />
          {/* MM logos emerging from the gap between box and lid (mid-right area) */}
          <img src={mmLogoMini} alt="" className="absolute right-24 top-[45%] w-7 h-7 rounded-lg shadow-md pointer-events-none opacity-80 rotate-[-10deg] animate-pulse" style={{ animationDuration: '3s' }} />
          <img src={mmLogoMini} alt="" className="absolute right-36 top-[40%] w-5 h-5 rounded-md shadow-sm pointer-events-none opacity-70 rotate-[20deg] animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '0.8s' }} />
          <img src={mmLogoMini} alt="" className="absolute right-16 top-[50%] w-4 h-4 rounded-sm shadow-sm pointer-events-none opacity-60 rotate-[-25deg] animate-pulse" style={{ animationDuration: '4s', animationDelay: '1.2s' }} />
          {/* Sparkles around the gap area */}
          <span className="absolute right-20 top-[42%] w-1.5 h-1.5 rounded-full bg-saffron/60 pointer-events-none animate-pulse" style={{ animationDuration: '2s' }} />
          <span className="absolute right-30 top-[48%] w-1 h-1 rounded-full bg-gold/50 pointer-events-none animate-pulse" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
          <span className="absolute right-40 top-[44%] w-1 h-1 rounded-full bg-saffron/45 pointer-events-none animate-pulse" style={{ animationDuration: '2.8s', animationDelay: '0.5s' }} />
          <span className="absolute right-12 top-[46%] w-1.5 h-1.5 rounded-full bg-gold/40 pointer-events-none animate-pulse" style={{ animationDuration: '3s', animationDelay: '1s' }} />
          <span className="absolute right-28 top-[52%] w-1 h-1 rounded-full bg-saffron/50 pointer-events-none animate-pulse" style={{ animationDuration: '2.2s', animationDelay: '0.7s' }} />

          {/* Text content — left side, with right padding for the box */}
          <div className="relative z-10 p-8 pr-36 sm:pr-44">
            <h2 className="text-2xl font-headline font-semibold text-foreground mb-2">
              Share the Gift of Inner Mastery
            </h2>
            <p className="text-muted-foreground font-body max-w-xs">
              Unlock a month free &amp; become a Founding Member
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="rounded-2xl border border-border bg-card/65 backdrop-blur-[30px] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-headline font-semibold text-foreground mb-4">How It Works</h3>
          <div className="space-y-4">
            {[
              'Share your invite link',
              'You get 1 month free once they subscribe to Pro (valid up to 6 months free & this resets every 3 months)',
              'You unlock Founding Member badge with first access and opportunity to co-build with the founding team (locked after first 100 users)',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-saffron/15 flex items-center justify-center text-xs font-semibold text-saffron">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Link */}
        <div className="rounded-2xl border border-border bg-card/65 backdrop-blur-[30px] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-headline font-semibold text-foreground mb-4">Your Referral Link</h3>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 rounded-xl border border-border bg-muted/50 px-4 py-2.5">
                <p className="text-sm font-mono text-foreground truncate">{referralLink}</p>
              </div>
              <Button
                variant="critical"
                size="default"
                onClick={handleCopy}
                className="flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy link
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-2xl border border-border bg-card/65 backdrop-blur-[30px] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)] text-center">
          <p className="text-lg font-body font-medium text-foreground">
            <span className="text-saffron font-semibold">{signedUpCount}</span> signed up · <span className="text-saffron font-semibold">{convertedCount}</span> converted
          </p>
          {signedUpCount === 0 && (
            <p className="text-sm text-muted-foreground font-body mt-1">Share your link to get started!</p>
          )}
        </div>

        {/* Terms Link */}
        <div className="text-center pb-4">
          <button
            onClick={() => setShowTerms(true)}
            className="text-sm text-gold font-body underline underline-offset-4 hover:text-saffron transition-colors"
          >
            View Terms and Conditions
          </button>
        </div>
      </div>

      {/* Terms Modal */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-headline">Referral Program Terms</DialogTitle>
            <DialogDescription>Last updated: March 2026</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground font-body">
            {[
              { title: '1. Eligibility', items: ['Only active Mind Module users can refer others', 'Self-referrals are not allowed', 'One referral per user (referee can only be referred once)'] },
              { title: '2. Rewards', items: ['Referrer receives 1 month free for each Pro subscriber they refer', 'Maximum 6 free months per 3-month period', 'Credits reset every 3 months from first earned credit', 'Credits apply to active subscriptions only'] },
              { title: '3. Founding Member Badge', items: ['Locked after first 100 Pro subscribers', 'Grants access to co-building opportunities with founding team', 'Lifetime designation (does not expire)'] },
              { title: '4. Conversion Requirements', items: ['Signup = user completes onboarding', 'Conversion = user subscribes to Pro (paid plan)', 'Free trial subscriptions count toward referrer credit once converted to paid'] },
            ].map((section) => (
              <div key={section.title}>
                <h4 className="font-medium text-foreground mb-1">{section.title}</h4>
                <ul className="list-disc pl-5 space-y-1">
                  {section.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            ))}
            <div>
              <h4 className="font-medium text-foreground mb-1">5. Termination</h4>
              <p>Mind Module reserves the right to suspend or terminate accounts that violate referral program rules. Fraudulent activity will result in forfeiture of all credits.</p>
            </div>
            <p className="text-xs">For questions, contact support@mindmodule.app</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Refer;
