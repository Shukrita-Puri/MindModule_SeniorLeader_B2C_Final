import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Gift, Copy, Check, Users, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';

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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mind Module',
          text: 'Join me on Mind Module - Proactive Self Mastery for Peak Performers.',
          url: referralLink,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
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
            <h1 className="text-xl font-headline font-semibold">Refer Friends</h1>
            <p className="text-sm text-muted-foreground">Share the mental edge</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero Card */}
        <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-headline font-semibold mb-2">
              Share the Gift of Inner Mastery
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Unlock a month free & become a Founding Member
            </p>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-primary font-semibold">•</span>
              <p className="text-sm text-muted-foreground">Share your invite link</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-semibold">•</span>
              <p className="text-sm text-muted-foreground">
                You get 1 month free once they subscribe to Pro (up to 6 months — resets every 3 months)
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-semibold">•</span>
              <p className="text-sm text-muted-foreground">
                You unlock Founding Member badge with first access and opportunity to co-build with the founding team (locked after first 100 users)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Referral Link */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Referral Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input 
                    value={referralLink} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                
                <Button className="w-full" onClick={handleShare}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              Your Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-lg font-medium">
                {signedUpCount} signed up · {convertedCount} converted
              </p>
              {signedUpCount === 0 && (
                <p className="text-sm text-muted-foreground mt-1">Share your link to get started!</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Terms Link */}
        <div className="text-center">
          <button
            onClick={() => setShowTerms(true)}
            className="text-sm text-primary underline"
          >
            View Terms and Conditions
          </button>
        </div>
      </div>

      {/* Terms Modal */}
      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Referral Program Terms</DialogTitle>
            <DialogDescription>
              Last updated: March 2026
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-medium text-foreground mb-1">1. Eligibility</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Only active Mind Module users can refer others</li>
                <li>Self-referrals are not allowed</li>
                <li>One referral per user (referee can only be referred once)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">2. Rewards</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Referrer receives 1 month free for each Pro subscriber they refer</li>
                <li>Maximum 6 free months per 3-month period</li>
                <li>Credits reset every 3 months from first earned credit</li>
                <li>Credits apply to active subscriptions only</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">3. Founding Member Badge</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Locked after first 100 Pro subscribers</li>
                <li>Grants access to co-building opportunities with founding team</li>
                <li>Lifetime designation (does not expire)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">4. Conversion Requirements</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Signup = user completes onboarding</li>
                <li>Conversion = user subscribes to Pro (paid plan)</li>
                <li>Free trial subscriptions count toward referrer credit once converted to paid</li>
              </ul>
            </div>
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
