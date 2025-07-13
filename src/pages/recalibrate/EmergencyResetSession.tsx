import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantExecutiveOrb from "@/assets/vibrant-executive-orb.png";

const EmergencyResetSession = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads
  const [isResetting, setIsResetting] = useState(true);

  useEffect(() => {
    // Auto-return after 3 minutes
    const timer = setTimeout(() => {
      setIsResetting(false);
    }, 180000);

    return () => clearTimeout(timer);
  }, []);

  if (!isResetting) {
    return (
      <div className="min-h-screen bg-background font-editorial pb-32 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-medium text-foreground mb-8">
            Reset Complete
          </h2>
          <Button
            onClick={() => navigate('/recalibrate')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-editorial pb-32">
      <ClearBackButton />
      
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src={vibrantExecutiveOrb} 
            alt="Emergency reset and grounding"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-2xl font-heading font-medium text-foreground mb-12">
          Emergency Reset Active
        </h2>
        
        <div className="bg-card border border-border rounded-lg p-12 mb-16 text-left">
          <div className="space-y-8">
            <div>
              <h3 className="font-heading font-medium text-foreground mb-4 text-lg">Present Moment</h3>
              <p className="text-muted-foreground font-body leading-relaxed">
                Notice: You are here, now, in this moment. You are safe.
              </p>
            </div>
            
            <div>
              <h3 className="font-heading font-medium text-foreground mb-4 text-lg">Body Reset</h3>
              <div className="space-y-3 text-muted-foreground font-body leading-relaxed">
                <p>Drop your shoulders</p>
                <p>Relax your jaw</p>
                <p>Soften your belly</p>
                <p>Feel your feet on the ground</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Grounding */}
        <div className="mt-16">
          <div className="text-center mb-12">
            <h3 className="text-xl font-heading font-medium text-foreground mb-4">
              Quick Grounding
            </h3>
            <p className="text-muted-foreground font-body">
              Right now, notice
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 text-center">
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">5</span>
                <span className="text-muted-foreground font-body">Things you can see</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">4</span>
                <span className="text-muted-foreground font-body">Things you can touch</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">3</span>
                <span className="text-muted-foreground font-body">Things you can hear</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">2</span>
                <span className="text-muted-foreground font-body">Things you can smell</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">1</span>
                <span className="text-muted-foreground font-body">Thing you can taste</span>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={() => setIsResetting(false)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
        >
          I'm ready to continue
        </Button>
      </div>

    </div>
  );
};

export default EmergencyResetSession;