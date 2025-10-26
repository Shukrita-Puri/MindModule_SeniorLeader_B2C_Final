
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
    <div className="min-h-screen bg-background text-foreground font-editorial flex flex-col items-center justify-center px-4 pb-24 section-spacing">
      {/* Hero Illustration - Editorial Layout */}
      <div className="mb-12 editorial-margin">
        <div className="relative max-w-md mx-auto">
          <div className="w-full aspect-[4/5] rounded-sm border border-gold/20 overflow-hidden shadow-[0_4px_6px_rgba(0,0,0,0.07),0_2px_4px_rgba(0,0,0,0.06)]">
            <img 
              src="/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png"
              alt="Watercolor mind illustration"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Small accent illustration */}
          <div className="absolute -bottom-6 -right-6 w-20 h-20 sm:w-24 sm:h-24 bg-card rounded-sm border border-gold/30 flex items-center justify-center shadow-lg">
            <img 
              src="/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png"
              alt="Network connection icon"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain opacity-80"
            />
          </div>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center mb-8">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-headline font-bold text-foreground mb-6 leading-tight">
          Mind Module
        </h1>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-editorial font-medium text-primary mb-6 italic">
          Mind Mastery for Achievers
        </h2>
      </div>

      {/* Subtitle */}
      <div className="text-center mb-16 max-w-2xl px-4">
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed font-body">
          First Context based Thinking Partner for developing Meta Skill
        </p>
      </div>

      {/* CTA Button */}
      <div className="text-center">
        <Button 
          onClick={handleGetStarted}
          size="lg"
          className="text-base sm:text-lg font-medium"
        >
          Let's Go!
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default Front;
