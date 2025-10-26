
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight, ChevronLeft, ChevronRight, Brain, MessageSquare, Target, Users, Lightbulb, User } from "lucide-react";

const TodaysFocusCard = () => {
  const navigate = useNavigate();
  const focusScrollRef = useRef<HTMLDivElement>(null);

  const domainPillars = {
    "cognitive": { 
      icon: Brain, 
      color: "text-blue-600", 
      bgColor: "from-blue-50 to-blue-100",
      borderColor: "border-blue-200"
    },
    "influence": { 
      icon: MessageSquare, 
      color: "text-green-600", 
      bgColor: "from-green-50 to-green-100",
      borderColor: "border-green-200"
    },
    "emotional": { 
      icon: Target, 
      color: "text-purple-600", 
      bgColor: "from-purple-50 to-purple-100",
      borderColor: "border-purple-200"
    },
    "relational": { 
      icon: Users, 
      color: "text-orange-600", 
      bgColor: "from-orange-50 to-orange-100",
      borderColor: "border-orange-200"
    },
    "purpose": { 
      icon: Lightbulb, 
      color: "text-yellow-600", 
      bgColor: "from-yellow-50 to-yellow-100",
      borderColor: "border-yellow-200"
    },
    "selfmastery": { 
      icon: User, 
      color: "text-red-600", 
      bgColor: "from-red-50 to-red-100",
      borderColor: "border-red-200"
    }
  };

  const todaysFocusItems = [
    {
      title: "Investor Pitch Preparation",
      subtitle: "High-stakes meeting in 4 hours",
      domain: "influence",
      domainTitle: "Influence & Communication Leadership",
      pillarFocus: "High-Stakes Communication & Strategic Storytelling",
      action: "Prepare Communication",
      route: "/practice",
      learning: {
        title: "Executive Presence Framework",
        description: "Command attention through confident body language, clear messaging, and strategic pauses",
        relevance: "Critical for investor confidence and funding success"
      }
    },
    {
      title: "Team Performance Discussion",
      subtitle: "Weekly 1:1 with Sarah at 3 PM",
      domain: "emotional",
      domainTitle: "Emotional Mastery & Nervous System Intelligence",
      pillarFocus: "Emotional Intelligence & Psychological Safety",
      action: "Prepare Session",
      route: "/practice",
      learning: {
        title: "Emotional Intelligence in Leadership",
        description: "Create psychological safety through active listening and empathetic responses",
        relevance: "Based on your team dynamics assessment"
      }
    }
  ];

  const scrollFocus = (direction: 'left' | 'right') => {
    if (focusScrollRef.current) {
      const scrollAmount = 320;
      focusScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <Card className="bg-gradient-to-r from-gray-900 to-black text-white border-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Calendar size={20} className="text-hyper-coral" />
            Today's Focus
            <Badge variant="outline" className="text-xs ml-2 border-white/30 text-gray-300">2 of 6 Pillars</Badge>
          </CardTitle>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => scrollFocus('left')}
              className="h-8 w-8 p-0 hover:bg-white/20 text-white"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => scrollFocus('right')}
              className="h-8 w-8 p-0 hover:bg-white/20 text-white"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          ref={focusScrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {todaysFocusItems.map((item, index) => {
            const pillar = domainPillars[item.domain as keyof typeof domainPillars];
            const Icon = pillar.icon;
            
            return (
              <div key={index} className={`min-w-[340px] bg-gradient-to-r ${pillar.bgColor} rounded-2xl p-4 border ${pillar.borderColor}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-base text-black">{item.title}</h3>
                    <p className="text-gray-600 text-sm">{item.subtitle}</p>
                  </div>
                  <Badge className="bg-hyper-coral text-white animate-pulse">Priority</Badge>
                </div>
                
                <div className="mb-3 p-2 bg-white/70 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={pillar.color} />
                    <h4 className="font-medium text-xs text-gray-800">{item.domainTitle}</h4>
                  </div>
                  <p className="text-xs text-gray-700 font-medium">{item.pillarFocus}</p>
                </div>
                
                <div className="mb-4 p-3 bg-white/70 rounded-xl border border-gray-100">
                  <div className="flex items-start gap-2 mb-2">
                    <Lightbulb size={14} className="text-hyper-coral mt-0.5" />
                    <div>
                      <h4 className="font-medium text-sm text-black">{item.learning.title}</h4>
                      <p className="text-xs text-gray-700 mb-1">{item.learning.description}</p>
                      <p className="text-xs text-hyper-coral font-medium">{item.learning.relevance}</p>
                    </div>
                  </div>
                </div>

                <Button 
                  className="w-full bg-hyper-coral hover:bg-red-600 text-white transition-all duration-200"
                  onClick={() => navigate(item.route)}
                >
                  {item.action}
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default TodaysFocusCard;
