
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mic } from "lucide-react";

const MindsetCoachCard = () => {
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-to-r from-gray-900 to-black text-white border-0 hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mic size={20} className="text-hyper-coral animate-pulse" />
            <h3 className="font-bold">Mindset Coach</h3>
          </div>
          <MessageCircle size={20} className="text-white" />
        </div>
        
        <p className="text-sm text-gray-300 mb-4">
          Voice-first clarity sessions for deeper insights
        </p>
        
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-hyper-coral rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-300">Ready to listen</span>
        </div>

        <Button 
          onClick={() => navigate('/clarity')}
          className="w-full bg-hyper-coral hover:bg-red-600 text-white border-0 transition-all duration-200"
        >
          Start Clarity Session
        </Button>
      </CardContent>
    </Card>
  );
};

export default MindsetCoachCard;
