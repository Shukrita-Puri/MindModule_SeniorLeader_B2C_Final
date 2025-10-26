
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import PowerUpSounds from "@/components/PowerUpSounds";

type UserMood = "overwhelmed" | "tired" | "focused" | "stressed";

const PowerUpCard = () => {
  const navigate = useNavigate();
  const [showPowerUp, setShowPowerUp] = useState(false);

  const getUserMoodBasedPowerUp = () => {
    const userMood = "focused" as UserMood;
    
    switch(userMood) {
      case "overwhelmed":
        return { title: "60 Sec Pause", description: "Quick calming reset for overwhelming moments" };
      case "tired":
        return { title: "60 Sec Energize", description: "Boost your energy with focused frequencies" };
      case "stressed":
        return { title: "60 Sec Reset", description: "Find your calm center in one minute" };
      case "focused":
      default:
        return { title: "60 Sec Power Up", description: "Quick energy boost with focused sound frequencies" };
    }
  };

  const powerUpConfig = getUserMoodBasedPowerUp();

  const handlePowerUpComplete = () => {
    setShowPowerUp(false);
    localStorage.setItem('powerUpCompleted', 'true');
  };

  return (
    <Card className="bg-gradient-to-r from-hyper-coral/10 to-red-100 border-hyper-coral/20 border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap size={20} className="text-hyper-coral" />
          {powerUpConfig.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {showPowerUp ? (
          <PowerUpSounds onComplete={handlePowerUpComplete} />
        ) : (
          <div className="space-y-3">
            <p className="text-gray-700 text-sm">
              {powerUpConfig.description}
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowPowerUp(true)}
                className="flex-1 bg-hyper-coral hover:bg-red-600 text-white"
              >
                Start Power Up
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate('/recalibrate')}
                className="border-hyper-coral text-hyper-coral hover:bg-hyper-coral hover:text-white"
              >
                More Options
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PowerUpCard;
