import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Share2, Copy, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';
import giftBoxImg from '@/assets/shared/referral-gift-box.png';
import mmLogoMini from '@/assets/brand/mm-logo-mini.png';

const APP_STORE_URL = 'https://apps.apple.com/app/mind-module/id123456789';

const Refer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
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
          setReferralCode(data.referral_code || '');
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

  const getShareMessage = () =>
    `I've been using Mind Module — an inner operating system for leaders who operate under sustained pressure. It has been helping me stay regulated under pressure, lead with more clarity and make better decisions when it matters most. Thought you'd find it valuable too.\n\nDownload it here: ${APP_STORE_URL}\n\nUse my code ${referralCode}`;

  const handleShare = async () => {
    const message = getShareMessage();

    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        toast.success('Shared successfully!');
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('[Refer] Share failed:', err);
          await fallbackCopy(message);
        }
      }
    } else {
      await fallbackCopy(message);
    }
  };

  const fallbackCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Message copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy message');
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast.success('Code copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy code');
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
        {/* Hero Section */}
        <div className="relative rounded-2xl border border-saffron/20 bg-gradient-to-br from-saffron/10 via-gold/5 to-background overflow-hidden shadow-[0_8px_32px_rgba(245,158,11,0.08)]">
          {/* Gift box image */}
          <img
            src={giftBoxImg}
            alt="Referral gift box"
            className="absolute -right-16 -top-4 w-56 h-56 sm:w-64 sm:h-64 object-contain pointer-events-none opacity-90 drop-shadow-lg"
          />

          {/* MM logos + sparkles bursting from gift box gap */}
          <div className="absolute -right-16 -top-4 w-56 h-56 sm:w-64 sm:h-64 pointer-events-none" aria-hidden="true">
            {/* Large MM logo — top-left of burst */}
            <img src={mmLogoMini} alt="" className="absolute left-[18%] top-[36%] w-7 h-7 rounded-full shadow-md -rotate-6" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }} />
            {/* Medium MM logo — upper right */}
            <img src={mmLogoMini} alt="" className="absolute left-[38%] top-[30%] w-5 h-5 rounded-full shadow-sm rotate-12" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }} />
            {/* Small MM logo — lower */}
            <img src={mmLogoMini} alt="" className="absolute left-[28%] top-[50%] w-4 h-4 rounded-full shadow-sm rotate-6" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }} />

            {/* Sparkles */}
            <span className="absolute left-[14%] top-[32%] w-1.5 h-1.5 rounded-full bg-saffron/50" />
            <span className="absolute left-[34%] top-[48%] w-1 h-1 rounded-full bg-gold/50" />
            <span className="absolute left-[42%] top-[38%] w-1 h-1 rounded-full bg-saffron/60" />
          </div>


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
        <Card className="p-6">
          <h3 className="text-lg font-headline font-semibold text-foreground mb-4">How It Works</h3>
          <div className="space-y-4">
            {[
              'Share your referral code',
              'You get 1 month free once they subscribe to Pro (valid for up to 6 months free & this resets every 3 months)',
              'You unlock Founding Member badge with first access to new features (locked after first 100 users)',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-taupe/15 flex items-center justify-center text-xs font-semibold text-taupe">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Referral Code */}
        <Card className="p-6">
          <h3 className="text-lg font-headline font-semibold text-foreground mb-4">Your Referral Code</h3>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={handleCopyCode}
                className="w-full rounded-xl border border-saffron/20 bg-saffron/5 px-6 py-4 text-center transition-colors hover:bg-saffron/10 active:scale-[0.98]"
              >
                <p className="text-2xl font-mono font-bold tracking-wider text-foreground">{referralCode}</p>
                <p className="text-xs text-muted-foreground mt-1">Tap to copy code</p>
              </button>

              <Button
                variant="critical"
                size="lg"
                onClick={handleShare}
                className="w-full"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    Share the Gift
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* Stats */}
        <Card className="p-6 text-center">
          <p className="text-lg font-body font-medium text-foreground">
            <span className="text-saffron font-semibold">{signedUpCount}</span> signed up · <span className="text-saffron font-semibold">{convertedCount}</span> converted
          </p>
          {signedUpCount === 0 && (
            <p className="text-sm text-muted-foreground font-body mt-1">Share your code to get started!</p>
          )}
        </Card>

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
              { title: '3. Founding Member Badge', items: ['Locked after first 100 Pro subscribers', 'Grants access to first access to new features', 'Lifetime designation (does not expire)'] },
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
