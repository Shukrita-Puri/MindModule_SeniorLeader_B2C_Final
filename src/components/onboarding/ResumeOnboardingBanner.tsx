import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { getOnboardingStatus, getResumeRoute } from "@/utils/onboardingStatus";
import { GoldDivider } from "@/components/ui/divider";

export const ResumeOnboardingBanner = () => {
  const navigate = useNavigate();
  const status = getOnboardingStatus();

  // Don't show if onboarding is complete or not started
  if (status.isComplete || !status.hasStarted) {
    return null;
  }

  const handleResume = () => {
    const resumeRoute = getResumeRoute();
    navigate(resumeRoute);
  };

  const getStageDescription = () => {
    if (status.currentStage <= 4) {
      return "Complete your assessment to unlock your personalized baseline";
    } else if (status.currentStage === 5) {
      return "Create your account to save your progress";
    } else if (status.currentStage === 6) {
      return "View your meta-skill results and insights";
    } else if (status.currentStage === 7) {
      return "Choose your plan to unlock full features";
    } else {
      return "Connect your calendar and wearables for intelligent recommendations";
    }
  };

  return (
    <Card className="border-2 border-gold/30 bg-gradient-to-br from-gold/5 via-background to-primary/5 overflow-hidden animate-fade-in">
      <div className="p-6 space-y-4">
        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-gold" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-headline font-bold text-foreground mb-1">
              Continue Your Journey
            </h3>
            <p className="text-sm text-muted-foreground">
              {getStageDescription()}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">
              Progress: {status.completedStages.length} of {status.totalStages} steps
            </span>
            <span className="text-gold font-semibold">
              {status.percentComplete}% Complete
            </span>
          </div>
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold via-gold to-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${status.percentComplete}%` }}
            />
          </div>
        </div>

        <GoldDivider />

        {/* Benefits List */}
        <div className="space-y-2 py-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-gold flex-shrink-0" />
            <span className="text-foreground">
              Get your personalized meta-skill baseline
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-gold flex-shrink-0" />
            <span className="text-foreground">
              Access context-aware practice recommendations
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-gold flex-shrink-0" />
            <span className="text-foreground">
              Unlock your full cognitive arsenal
            </span>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={handleResume}
          size="lg"
          className="w-full bg-gradient-to-r from-gold to-primary hover:from-gold/90 hover:to-primary/90"
        >
          Resume Onboarding
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Takes ~{Math.max(1, Math.ceil((status.totalStages - status.completedStages.length) * 0.75))} minutes to complete
        </p>
      </div>
    </Card>
  );
};
