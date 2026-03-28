
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, ChevronLeft, ChevronRight, Sun, Activity, Zap, Heart, Moon, Target, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTodayCheckin } from "@/utils/dailyCheckins";

const WellnessCard = () => {
  const wellnessScrollRef = useRef<HTMLDivElement>(null);

  const { data: checkInData } = useQuery({
    queryKey: ['today-checkin'],
    queryFn: getTodayCheckin,
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (data) => data ? {
      energy: data.energy_balance,
      mood: data.outcome,
      focus: data.clarity_level ? ['Low', 'Below Avg', 'Average', 'Good', 'High'][data.clarity_level - 1] : null,
    } : null,
  });

  const wellnessData = [
    { label: "Sun Time", value: "2.5 hrs", icon: Sun, color: "text-yellow-600" },
    { label: "Movement", value: "8,247 steps", icon: Activity, color: "text-green-600" },
    { label: "Energy", value: checkInData?.energy ? `${checkInData.energy}/10` : "Good", icon: Zap, color: "text-blue-600" },
    { label: "Emotion", value: checkInData?.mood ? checkInData.mood.charAt(0).toUpperCase() + checkInData.mood.slice(1) : "Focused", icon: Heart, color: "text-red-600" },
    { label: "Sleep", value: "7.2 hrs", icon: Moon, color: "text-purple-600" },
    { label: "Focus", value: checkInData?.focus || "Low", icon: Target, color: "text-forest" }
  ];

  const scrollWellness = (direction: 'left' | 'right') => {
    if (wellnessScrollRef.current) {
      const scrollAmount = 200;
      wellnessScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <Card className="bg-white border-0 shadow-sm hover:shadow-lg transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp size={20} className="text-hyper-coral" />
            Today's Performance Vitals
            {checkInData && (
              <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                <Calendar size={12} />
                Check-in Complete
              </div>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => scrollWellness('left')}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => scrollWellness('right')}
              className="h-8 w-8 p-0"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          ref={wellnessScrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {wellnessData.map((data, index) => (
            <div key={index} className="min-w-[120px] text-center group cursor-pointer bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors duration-200">
              <div className={`p-2 ${data.color} bg-white rounded-lg mx-auto w-fit mb-2 group-hover:scale-110 transition-transform duration-200`}>
                <data.icon size={20} />
              </div>
              <p className="font-semibold text-sm text-black group-hover:text-hyper-coral transition-colors duration-200">{data.value}</p>
              <p className="text-xs text-gray-600">{data.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WellnessCard;
