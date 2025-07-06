
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Brain, ChevronRight } from "lucide-react";

const MindVaultInsightCard = () => {
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-to-r from-gray-900 to-black text-white border-0 hover:shadow-xl transition-all duration-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-white">
          <BarChart3 size={20} className="text-hyper-coral" />
          Mind Vault Insight
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-white/20 rounded-lg border border-white/30 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-full">
              <Brain size={16} className="text-hyper-coral" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-white text-sm mb-1">Recurring Pattern Discovery</h4>
              <p className="text-gray-300 text-sm mb-2">
                Your decision-making improves <span className="font-bold text-white">34%</span> when you take micro-breaks between choices
              </p>
              <p className="text-xs text-gray-400 bg-white/20 rounded px-2 py-1 inline-block">
                Based on 12 scenario sessions this month
              </p>
            </div>
          </div>
        </div>

        <Button 
          className="w-full bg-hyper-coral hover:bg-red-600 text-white border-0 transition-all duration-200 flex items-center justify-center gap-2"
          onClick={() => navigate('/mind-vault')}
        >
          View Full Progress
          <ChevronRight size={16} />
        </Button>
      </CardContent>
    </Card>
  );
};

export default MindVaultInsightCard;
