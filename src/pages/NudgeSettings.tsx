
import { useState } from "react";
import { ArrowLeft, Bell, Calendar, Brain, Heart, Zap, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import MainNavigation from "@/components/MainNavigation";

const NudgeSettings = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState({
    practice: true,
    recalibrate: false,
    sos: true,
    patterns: true
  });

  const nudgeTypes = [
    {
      id: "practice",
      name: "Practice Nudges",
      description: "Practice opportunities before key interactions",
      icon: Zap,
      color: "text-hyper-coral"
    },
    {
      id: "recalibrate",
      name: "Recalibrate Nudges", 
      description: "Breathing and energy management reminders",
      icon: Brain,
      color: "text-hyper-coral"
    },
    {
      id: "sos",
      name: "Grounding Nudges",
      description: "Support during stress or overwhelm",
      icon: Bell,
      color: "text-hyper-coral"
    },
    {
      id: "patterns",
      name: "Pattern Recognition Nudges",
      description: "Insights from behavioral patterns",
      icon: Calendar,
      color: "text-hyper-coral"
    }
  ];

  const toggleNotification = (type: string) => {
    setNotifications(prev => ({
      ...prev,
      [type]: !prev[type as keyof typeof prev]
    }));
  };

  return (
    <div className="min-h-screen pb-20">
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
            <h1 className="text-xl font-bold text-gray-900 uppercase">SMART NUDGE SETTINGS</h1>
            <p className="text-sm text-gray-600">Configure your intelligent notifications</p>
          </div>
          <div className="w-10 h-10" />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            onClick={() => navigate("/nudge-simulator")}
            className="bg-hyper-coral hover:bg-red-600 text-white h-12"
          >
            Preview Nudges
          </Button>
          <Button 
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-50 h-12"
          >
            Reset All
          </Button>
        </div>

        {/* Global Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900">Global Settings</CardTitle>
            <CardDescription className="text-gray-600">
              Configure when and how you receive nudges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-800">Nudge Frequency</Label>
                <p className="text-sm text-gray-600">How often should we send nudges?</p>
              </div>
              <Select defaultValue="moderate">
                <SelectTrigger className="w-32 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="frequent">Frequent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-800">Quiet Hours</Label>
                <p className="text-sm text-gray-600">No nudges during these times</p>
              </div>
              <Select defaultValue="22-07">
                <SelectTrigger className="w-32 border-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="22-07">10 PM - 7 AM</SelectItem>
                  <SelectItem value="23-08">11 PM - 8 AM</SelectItem>
                  <SelectItem value="21-06">9 PM - 6 AM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Nudge Types */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900 text-lg">Nudge Types</h3>
          
          {nudgeTypes.map((nudgeType) => (
            <Card key={nudgeType.id} className="bg-white border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-50">
                      <nudgeType.icon size={20} className={nudgeType.color} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{nudgeType.name}</h4>
                      <p className="text-sm text-gray-600">{nudgeType.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications[nudgeType.id as keyof typeof notifications]}
                    onCheckedChange={() => toggleNotification(nudgeType.id)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Data Sources */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg text-gray-900">Data Sources</CardTitle>
            <CardDescription className="text-gray-600">
              Connect data sources for smarter nudges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-800">Calendar Integration</Label>
                <p className="text-sm text-gray-600">Nudges based on your schedule</p>
              </div>
              <Button variant="outline" className="border-gray-300 text-gray-700">
                Connect
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-800">Wearable Data</Label>
                <p className="text-sm text-gray-600">Stress and energy patterns</p>
              </div>
              <Button variant="outline" className="border-gray-300 text-gray-700">
                Connect
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-800">Email Analysis</Label>
                <p className="text-sm text-gray-600">Communication tone insights</p>
              </div>
              <Button variant="outline" className="border-gray-300 text-gray-700">
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <MainNavigation />
    </div>
  );
};

export default NudgeSettings;
