import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isInIframe, openAuthInNewTab } from '@/utils/authRedirect';

const Stage8SignupStep = () => {
  const { isAuthenticated, isLoading, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const inIframe = isInIframe();

  // If authenticated, continue to results
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/onboarding/results');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Handler for iframe - opens new tab
  const handleOpenInNewTab = () => {
    openAuthInNewTab('/onboarding/signup-step');
  };

  // Handler for non-iframe - direct Auth0 popup
  const handleDirectSignup = async () => {
    setIsSigningUp(true);
    try {
      await loginWithPopup({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
          screen_hint: 'signup',
          scope: 'openid profile email',
        },
      });
      navigate('/onboarding/results');
    } catch (error) {
      console.error('Signup failed:', error);
      setIsSigningUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If in iframe, show "Open in New Tab" UI
  if (inIframe) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8 text-center">
          <User className="w-12 h-12 mx-auto text-kairos" />
          <h1 className="text-2xl font-headline font-semibold tracking-tight">
            Create Your Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Secure signup opens in a new window
          </p>
          <Button onClick={handleOpenInNewTab} variant="critical" className="w-full gap-2">
            Continue to Signup
            <ExternalLink className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground/60">
            You'll complete your profile in the new tab
          </p>
        </div>
      </div>
    );
  }

  // If not in iframe, show direct signup button
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <User className="w-12 h-12 mx-auto text-kairos" />
        <h1 className="text-2xl font-headline font-semibold tracking-tight">
          Create Your Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Secure your progress and unlock personalized insights
        </p>
        <Button 
          onClick={handleDirectSignup} 
          variant="critical" 
          className="w-full"
          disabled={isSigningUp}
        >
          {isSigningUp ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </Button>
        <p className="text-xs text-muted-foreground/60">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
};

export default Stage8SignupStep;
