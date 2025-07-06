
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CognitiveArsenalCard = () => {
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-to-r from-gray-800 to-black text-white border-0 hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
      <CardContent className="p-4 text-center">
        <div className="w-8 h-8 mx-auto mb-2 bg-black rounded-full flex items-center justify-center">
          <img 
            src="/lovable-uploads/cc7c715b-a0d1-4464-b0e1-d338c14452a0.png" 
            alt="Mind Module" 
            className="w-6 h-6 object-contain"
          />
        </div>
        <h3 className="font-bold mb-2">Full Cognitive Arsenal</h3>
        <p className="text-sm opacity-90 mb-3">
          Access all mental performance tools
        </p>
        <Button 
          variant="secondary" 
          onClick={() => navigate('/index')}
          className="bg-hyper-coral text-white hover:bg-red-600 transition-all duration-200"
        >
          Explore Tools
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default CognitiveArsenalCard;
