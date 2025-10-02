import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Chrome, Apple, Facebook, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailAuth = () => {
    setIsLoading(true);
    setTimeout(() => {
      toast({
        title: isSignUp ? "Welcome to Mind Module!" : "Welcome back!",
        description: "Redirecting...",
      });
      setTimeout(() => navigate('/daily-check-in'), 1500);
      setIsLoading(false);
    }, 1000);
  };

  const handleSocialAuth = (provider: string) => {
    toast({
      title: "Coming Soon",
      description: `${provider} authentication will be available soon.`,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-editorial flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Mind Module Logo in Circle */}
        <div className="text-center mb-8">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden border-4 border-accent/20 shadow-xl bg-background flex items-center justify-center">
            <img 
              src="/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png"
              alt="Mind Module Logo"
              className="w-20 h-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2">
            Take the Next Quantum Leap with Mind Module
          </h1>
        </div>

        {/* Toggle Text */}
        <div className="text-center mb-6">
          {!isSignUp ? (
            <p className="text-sm text-muted-foreground font-body">
              Don't have a Mind Module account?{" "}
              <button 
                onClick={() => setIsSignUp(true)}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground font-body">
              Have a Mind Module account?{" "}
              <button 
                onClick={() => setIsSignUp(false)}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Log in
              </button>
            </p>
          )}
        </div>

        {/* Auth Buttons */}
        <div className="space-y-3 mb-6">
          <Button
            onClick={handleEmailAuth}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-6"
          >
            <Mail className="w-5 h-5 mr-2" />
            {isSignUp ? "Continue" : "Sign in"} with Email
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handleSocialAuth('Facebook')}
            className="w-full border-border text-foreground hover:bg-accent/10 font-medium py-6"
          >
            <Facebook className="w-5 h-5 mr-2" />
            {isSignUp ? "Continue" : "Sign in"} with Facebook
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handleSocialAuth('Apple')}
            className="w-full border-border text-foreground hover:bg-accent/10 font-medium py-6"
          >
            <Apple className="w-5 h-5 mr-2" />
            {isSignUp ? "Continue" : "Sign in"} with Apple
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handleSocialAuth('Google')}
            className="w-full border-border text-foreground hover:bg-accent/10 font-medium py-6"
          >
            <Chrome className="w-5 h-5 mr-2" />
            {isSignUp ? "Continue" : "Sign in"} with Google
          </Button>
        </div>

        {/* Terms and Privacy */}
        {isSignUp && (
          <p className="text-center text-xs text-muted-foreground font-body mt-6">
            By clicking continue you agree to our{" "}
            <button className="hover:underline">Terms</button>
            {" "}and acknowledge that you have read our{" "}
            <button className="hover:underline">Privacy Policy</button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Signup;
