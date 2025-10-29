import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResponse, clearSession } from "@/utils/onboardingStorage";
import { ArrowRight, Target, TrendingUp } from "lucide-react";

export default function Stage8PracticeSetup() {
  const navigate = useNavigate();
  const developmentArea = getResponse("primary_development_area") || "Adaptability & Learning Agility";
  const isSuperPro = getResponse("selected_plan") === "super_pro_monthly" || 
                     getResponse("selected_plan") === "super_pro_annual";

  const handleContinue = () => {
    clearSession();
    navigate("/executive-home");
  };

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      <div className="text-center">
        <h2 className="text-3xl font-headline font-bold mb-2">Your Practice Focus</h2>
        <p className="text-lg text-muted-foreground">
          We'll prioritize scenarios that strengthen your development area
        </p>
      </div>

      <Card className="bg-gold/5 border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-lg">
            <Target size={20} className="text-gold" />
            Primary Development Area
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-semibold text-gold text-center">
            {developmentArea}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <TrendingUp size={20} className="text-gold flex-shrink-0 mt-1" />
            <div>
              <p className="text-sm text-foreground/90 leading-relaxed">
                Research shows 3-4 practice sessions per week lead to measurable
                improvement within 21-30 days.
                {isSuperPro && " Your personalized practice starts now based on YOUR calendar and patterns."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleContinue}
        className="w-full"
        size="lg"
      >
        {isSuperPro ? "Go to Dashboard" : "Start First Practice"}
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
}
