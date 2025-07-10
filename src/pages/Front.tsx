
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
          <div className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
            <img 
              src="/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png"
              alt="Colorful artistic mind illustration"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-2 -right-2 sm:-bottom-3 sm:-right-3 md:-bottom-4 md:-right-4 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center shadow-lg">
            <img 
              src="/lovable-uploads/6ad3487d-07e9-414e-96cd-7a73d8a12c03.png"
              alt="Network connection icon"
              className="w-8 h-8 sm:w-12 sm:h-12 md:w-14 md:h-14 object-contain"
            />
          </div>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-heading font-bold text-foreground mb-4 sm:mb-6 leading-tight">
          Mind Module
        </h1>
        <h2 className="text-lg sm:text-2xl md:text-4xl font-editorial font-medium text-accent mb-6 sm:mb-8">
          For the Next Generation of Leaders
        </h2>
      </div>

      {/* Subtitle */}
      <div className="text-center mb-12 sm:mb-16 max-w-4xl px-4">
        <p className="text-base sm:text-xl md:text-2xl text-muted-foreground leading-relaxed font-body">
          AI-Powered Mind Management companion for High-performing students.
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
          Become the Mental Elite
        </p>
      </div>
    </div>
  );
};

export default Front;
