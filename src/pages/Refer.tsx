import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Gift, Copy, Check, Share2, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const Refer = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Generate a simple referral code based on user id
  const referralCode = user?.id ? `MA-${user.id.slice(0, 8).toUpperCase()}` : 'MA-XXXXX';
  const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Kairos',
          text: 'Join me on Kairos - Proactive Self Mastery for Peak Performers.',
          url: referralLink,
        });
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
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
              Share Kairos
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Invite friends and colleagues to join you on the path to mental mastery. 
              Help them discover AI-powered coaching and proven techniques.
            </p>
          </CardContent>
        </Card>

        {/* Referral Link */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Referral Link</CardTitle>
            <CardDescription>Share this link with friends</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            
            <div className="flex gap-3">
              <Button 
                className="flex-1"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Referral Code */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Referral Code</CardTitle>
            <CardDescription>Friends can enter this during signup</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 text-center">
              <span className="text-2xl font-mono font-semibold tracking-wider">
                {referralCode}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              Your Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>You haven't referred anyone yet.</p>
              <p className="text-sm mt-1">Share your link to get started!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Refer;
