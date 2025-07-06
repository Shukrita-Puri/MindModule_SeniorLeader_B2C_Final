
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

const MilestoneCard = () => {
  return (
    <Card className="bg-white border-0 shadow-sm hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-hyper-coral/10 rounded-full animate-pulse">
            <TrendingUp size={16} className="text-hyper-coral" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm text-hyper-coral">Milestone Unlocked!</p>
            <p className="text-xs text-gray-600">You've completed 5 clarity sessions this week</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MilestoneCard;
