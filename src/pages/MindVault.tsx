
import { useState } from "react";
import { ArrowLeft, Brain, TrendingUp, Zap, Eye, Calendar, Target, Heart, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainNavigation from "@/components/MainNavigation";
import DomainRadar from "@/components/DomainRadar";
import PatternBubbles from "@/components/PatternBubbles";
import ThoughtConnector from "@/components/ThoughtConnector";
import WeeklyInsights from "@/components/WeeklyInsights";
import LoopMapping from "@/components/LoopMapping";

const MindVault = () => {
  const navigate = useNavigate();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const masteryDomains = [
    {
      id: "cognitive",
      name: "Cognitive Excellence",
      description: "Mental patterns & decision intelligence",
      progress: 78,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Brain
    },
    {
      id: "influence",
      name: "Influence & Communication",
      description: "Leadership presence & persuasion",
      progress: 65,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Zap
    },
    {
      id: "emotional",
      name: "Emotional Mastery",
      description: "Emotional fluidity & nervous system intelligence",
      progress: 82,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Heart
    },
    {
      id: "relational",
      name: "Relational Wealth",
      description: "Power dynamics & valuable connections",
      progress: 71,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Users
    },
    {
      id: "purpose",
      name: "Purpose & Performance",
      description: "Meaning-aligned sustainable excellence",
      progress: 89,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Target
    },
    {
      id: "identity",
      name: "Self-Mastery & Identity",
      description: "Personal transformation & evolution",
      progress: 75,
      color: "text-hyper-coral",
      bgColor: "bg-red-50",
      icon: Eye
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 uppercase">MIND VAULT™</h1>
            <p className="text-sm text-gray-600">Intelligent Growth Insights</p>
          </div>
          <div className="w-10 h-10" /> {/* Spacer */}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-hyper-coral to-red-600 rounded-full flex items-center justify-center">
                <TrendingUp size={24} className="text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Growth ROI</h3>
              <p className="text-2xl font-bold text-hyper-coral">+247%</p>
              <p className="text-xs text-gray-600">This month</p>
            </CardContent>
          </Card>
          
          <Card className="bg-white border-gray-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-hyper-coral to-red-600 rounded-full flex items-center justify-center">
                <Brain size={24} className="text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Patterns</h3>
              <p className="text-2xl font-bold text-hyper-coral">23</p>
              <p className="text-xs text-gray-600">Detected loops</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white border-gray-200">
            <TabsTrigger value="overview" className="data-[state=active]:bg-red-50 data-[state=active]:text-hyper-coral">Overview</TabsTrigger>
            <TabsTrigger value="patterns" className="data-[state=active]:bg-red-50 data-[state=active]:text-hyper-coral">Patterns</TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-red-50 data-[state=active]:text-hyper-coral">Insights</TabsTrigger>
            <TabsTrigger value="loops" className="data-[state=active]:bg-red-50 data-[state=active]:text-hyper-coral">Loops</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Domain Radar */}
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900">Mastery Domains Progress</CardTitle>
                <CardDescription className="text-gray-600">Your growth across 6 core areas</CardDescription>
              </CardHeader>
              <CardContent>
                <DomainRadar domains={masteryDomains} />
              </CardContent>
            </Card>

            {/* Domain Cards */}
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900 text-lg">Domain Deep Dive</h3>
              {masteryDomains.map((domain) => (
                <Card key={domain.id} className="bg-white border-gray-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${domain.bgColor}`}>
                          <domain.icon size={20} className={domain.color} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900">{domain.name}</h4>
                          <p className="text-xs text-gray-600">{domain.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{domain.progress}%</p>
                        <div className="w-16 h-2 bg-gray-100 rounded-full">
                          <div 
                            className={`h-full rounded-full bg-gradient-to-r ${
                              domain.progress >= 80 ? 'from-hyper-coral to-red-600' :
                              domain.progress >= 60 ? 'from-hyper-coral to-red-500' :
                              'from-red-300 to-hyper-coral'
                            }`}
                            style={{ width: `${domain.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="patterns" className="space-y-6">
            <PatternBubbles />
            <ThoughtConnector />
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <WeeklyInsights />
          </TabsContent>

          <TabsContent value="loops" className="space-y-6">
            <LoopMapping />
          </TabsContent>
        </Tabs>
      </div>

      <MainNavigation />
    </div>
  );
};

export default MindVault;
