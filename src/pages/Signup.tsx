
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Mail, User, Lock, Chrome, Apple, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import vibrantCelebrationIllustration from "@/assets/vibrant-celebration-illustration.png";

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    password: "",
    confirmPassword: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  const validateCompanyEmail = (email: string) => {
    const commonPersonalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'icloud.com', 'aol.com', 'live.com', 'msn.com'
    ];
    const domain = email.split('@')[1];
    return !commonPersonalDomains.includes(domain?.toLowerCase());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSkip = () => {
    toast({
      title: "Entering Prototype Mode",
      description: "You can sign up later for full access.",
    });
    navigate('/app');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validation
    if (!validateCompanyEmail(formData.email)) {
      toast({
        title: "Company Email Required",
        description: "Please use your company email address for B2B access.",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please ensure both passwords are identical.",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    // Simulate API call
    setTimeout(() => {
      toast({
        title: "Account Created!",
        description: "Welcome to Mind Module. Redirecting to your dashboard...",
      });
      setTimeout(() => navigate('/app'), 1500);
      setIsLoading(false);
    }, 2000);
  };

  const handleSocialSignup = (provider: string) => {
    toast({
      title: "Coming Soon",
      description: `${provider} signup will be available for B2C users.`,
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

        {/* Vibrant Header Visual */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden border-2 border-accent/30">
            <img 
              src={vibrantCelebrationIllustration}
              alt="Welcome celebration"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground mb-2">
            Join Mind Module
          </h1>
          <p className="text-muted-foreground font-body">
            Create your B2B account with company email
          </p>
        </div>

        {/* Skip Option for Prototype */}
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-card-foreground">Prototype Mode</p>
              <p className="text-xs text-muted-foreground">Skip signup to explore the app</p>
            </div>
            <Button
              onClick={handleSkip}
              variant="outline"
              size="sm"
              className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
            >
              Skip for now
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName" className="text-foreground font-body">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                required
                value={formData.firstName}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground"
                placeholder="John"
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-foreground font-body">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                required
                value={formData.lastName}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground"
                placeholder="Doe"
              />
            </div>
          </div>

          {/* Company Email */}
          <div>
            <Label htmlFor="email" className="text-foreground font-body">Company Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground pl-10"
                placeholder="john@company.com"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Personal emails (Gmail, Yahoo, etc.) are not accepted
            </p>
          </div>

          {/* Company Name */}
          <div>
            <Label htmlFor="company" className="text-foreground font-body">Company Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="company"
                name="company"
                type="text"
                required
                value={formData.company}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground pl-10"
                placeholder="Acme Corporation"
              />
            </div>
          </div>

          {/* Password Fields */}
          <div>
            <Label htmlFor="password" className="text-foreground font-body">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="text-foreground font-body">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="bg-card border-border text-card-foreground pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            loading={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3"
          >
            Create Account
          </Button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-border"></div>
          <span className="px-4 text-muted-foreground text-sm font-body">B2C Options (Coming Soon)</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

        {/* Social Buttons */}
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSocialSignup('Google')}
            className="w-full border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            disabled
          >
            <Chrome className="w-4 h-4 mr-2" />
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSocialSignup('Apple')}
            className="w-full border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            disabled
          >
            <Apple className="w-4 h-4 mr-2" />
            Continue with Apple
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-sm mt-8 font-body">
          Already have an account?{" "}
          <button className="text-accent hover:underline">
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

export default Signup;
