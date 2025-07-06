
import { useState } from "react";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import vibrantGrowthIllustration from "@/assets/vibrant-growth-illustration.png";

const Front = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/signup');
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-editorial flex flex-col items-center justify-center px-4 pb-24">
      {/* Vibrant Hero Visual */}
      <div className="mb-8 sm:mb-12">
        <div className="relative">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
            <img 
              src={vibrantGrowthIllustration}
              alt="Growth and transformation"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 w-12 h-12 sm:w-16 sm:h-16 bg-accent rounded-full flex items-center justify-center shadow-lg">
            <img 
              src="/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png"
              alt="Mind Module Logo"
              className="w-6 h-6 sm:w-10 sm:h-10 object-contain"
            />
          </div>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-heading font-bold text-foreground mb-4 sm:mb-6 leading-tight">
          Inner Architect
        </h1>
        <h2 className="text-lg sm:text-2xl md:text-4xl font-editorial font-medium text-accent mb-6 sm:mb-8">
          For the Next Generation of Leaders
        </h2>
      </div>

      {/* Subtitle */}
      <div className="text-center mb-12 sm:mb-16 max-w-4xl px-4">
        <p className="text-base sm:text-xl md:text-2xl text-muted-foreground leading-relaxed font-body">
          AI-powered cognitive companion for high-achieving students.
        </p>
      </div>

      {/* CTA Button */}
      <div className="text-center">
        <Button 
          onClick={handleGetStarted}
          size="lg"
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-4 h-auto font-medium shadow-lg"
        >
          Get Started
          <ArrowRight className="w-6 h-6 ml-2" />
        </Button>
      </div>

      {/* Optional tagline at bottom */}
      <div className="fixed bottom-20 sm:bottom-8 left-0 right-0 text-center px-4">
        <p className="text-xs sm:text-sm text-muted-foreground font-body">
          Your cognitive companion for clarity and growth
        </p>
      </div>
    </div>
  );
};

export default Front;
