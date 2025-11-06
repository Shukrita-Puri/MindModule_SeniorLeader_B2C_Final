import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Chrome, Apple, Mail, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GoldDivider } from "@/components/ui/divider";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(true);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSignUp = async () => {
    try {
      // Validate inputs
      emailSchema.parse(email);
      passwordSchema.parse(password);
      nameSchema.parse(fullName);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);
    const isOnboardingFlow = window.location.pathname.includes('/onboarding');
    const redirectUrl = isOnboardingFlow 
      ? `${window.location.origin}/onboarding/results`
      : `${window.location.origin}/executive-home`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });

    setIsLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          title: "Email Already Registered",
          description: "Try signing in instead.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Sign Up Failed",
          description: error.message,
          variant: "destructive"
        });
      }
      return;
    }

    // Auto-confirm is enabled, so redirect immediately
    if (isOnboardingFlow) {
      navigate('/onboarding/results');
    } else {
      navigate('/executive-home');
    }
  };

  const handleEmailSignIn = async () => {
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Sign In Failed",
        description: "Invalid email or password",
        variant: "destructive"
      });
      return;
    }

    const isOnboardingFlow = window.location.pathname.includes('/onboarding');
    if (isOnboardingFlow) {
      navigate('/onboarding/results');
    } else {
      navigate('/executive-home');
    }
  };

  const handleGoogleAuth = async () => {
    const isOnboardingFlow = window.location.pathname.includes('/onboarding');
    const redirectUrl = isOnboardingFlow 
      ? `${window.location.origin}/onboarding/results`
      : `${window.location.origin}/executive-home`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });

    if (error) {
      toast({
        title: "Authentication Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleAppleAuth = async () => {
    const isOnboardingFlow = window.location.pathname.includes('/onboarding');
    const redirectUrl = isOnboardingFlow 
      ? `${window.location.origin}/onboarding/results`
      : `${window.location.origin}/executive-home`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUrl
      }
    });

    if (error) {
      toast({
        title: "Authentication Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-8 text-muted-foreground hover:text-taupe"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Mind Module Logo - Simplified */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <img 
              src="/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png"
              alt="Mind Module M Logo"
              className="w-full h-full object-contain img-architectural"
              key="m-logo-signup"
            />
          </div>
          <h1 className="text-4xl font-headline text-foreground mb-2 tracking-tight">
            Mind Module
          </h1>
          <p className="text-lg font-subheadline italic text-muted-foreground">
            Take the next quantum leap
          </p>
        </div>

        {/* Toggle Text */}
        <div className="text-center mb-8">
          {!isSignUp ? (
            <p className="text-sm text-muted-foreground font-body">
              Don't have a Mind Module account?{" "}
              <button 
                onClick={() => setIsSignUp(true)}
                className="text-taupe hover:text-taupe-rich underline transition-colors"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground font-body">
              Have a Mind Module account?{" "}
              <button 
                onClick={() => setIsSignUp(false)}
                className="text-taupe hover:text-taupe-rich underline transition-colors"
              >
                Log in
              </button>
            </p>
          )}
        </div>

        {/* Email Form */}
        {showEmailForm ? (
          <div className="space-y-4 mb-6">
            {isSignUp && (
              <div>
                <Label htmlFor="name" className="text-foreground">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              onClick={isSignUp ? handleEmailSignUp : handleEmailSignIn}
              disabled={isLoading}
              className="w-full taupe-gradient-shine text-taupe-foreground font-medium py-6 border border-taupe/20"
            >
              {isLoading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowEmailForm(false)}
              className="w-full"
            >
              Back to options
            </Button>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            <Button
              onClick={() => setShowEmailForm(true)}
              className="w-full taupe-gradient-shine text-taupe-foreground font-medium py-6 border border-taupe/20"
            >
              <Mail className="w-5 h-5 mr-2" />
              {isSignUp ? "Continue" : "Sign in"} with Email
            </Button>
            
            <Button
              variant="outline"
              onClick={handleAppleAuth}
              className="w-full bg-white/50 backdrop-blur-xl border border-taupe/30 text-foreground hover:bg-white/80 hover:border-taupe/50 font-medium py-6 transition-all"
            >
              <Apple className="w-5 h-5 mr-2" />
              {isSignUp ? "Continue" : "Sign in"} with Apple
            </Button>
            
            <Button
              variant="outline"
              onClick={handleGoogleAuth}
              className="w-full bg-white/50 backdrop-blur-xl border border-taupe/30 text-foreground hover:bg-white/80 hover:border-taupe/50 font-medium py-6 transition-all"
            >
              <Chrome className="w-5 h-5 mr-2" />
              {isSignUp ? "Continue" : "Sign in"} with Google
            </Button>
          </div>
        )}

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
