
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Smartphone, Trash2, Eye, Lock, Database, Wifi, Calendar, Mail, Watch, MessageCircle } from "lucide-react";

const PrivacyDashboard = () => {
  const [dataToggles, setDataToggles] = useState({
    calendar: true,
    email: false,
    wearable: true,
    social: false,
    documents: true
  });

  const [biometricLock, setBiometricLock] = useState(true);

  const handleToggle = (key: string) => {
    setDataToggles(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }));
  };

  const dataSources = [
    { key: "calendar", icon: Calendar, label: "Calendar Events", description: "Meeting patterns and scheduling insights" },
    { key: "email", icon: Mail, label: "Email Data", description: "Communications, Sentiment, Tone detection" },
    { key: "wearable", icon: Watch, label: "Wearable Data", description: "Stress and activity patterns" },
    { key: "social", icon: MessageCircle, label: "Social Data", description: "Casual/social communications, Sentiment, Tone, Real time conversations" },
    { key: "documents", icon: Database, label: "Document Access", description: "Knowledge work patterns" }
  ];

  return (
    <div className="space-y-6">
      {/* Local Processing Status */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Smartphone size={20} />
            Local-First Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-700">Your data stays on this device</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-green-600" />
              <span className="text-sm text-green-700">End-to-end encrypted insights</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-green-600" />
              <span className="text-sm text-green-700">No cloud storage of personal data</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Biometric Security */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Lock size={20} className="text-gray-800" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Biometric Lock</p>
              <p className="text-sm text-gray-600">Require Face ID/Touch ID to access insights</p>
            </div>
            <Switch 
              checked={biometricLock} 
              onCheckedChange={setBiometricLock}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Source Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database size={20} className="text-gray-800" />
            Data Sources
            <Badge variant="outline" className="ml-2">Full Control</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dataSources.map((source) => {
              const Icon = source.icon;
              const isEnabled = dataToggles[source.key as keyof typeof dataToggles];
              
              return (
                <div key={source.key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={isEnabled ? "text-blue-600" : "text-gray-400"} />
                    <div>
                      <p className="font-medium text-sm">{source.label}</p>
                      <p className="text-xs text-gray-600">{source.description}</p>
                    </div>
                  </div>
                  <Switch 
                    checked={isEnabled} 
                    onCheckedChange={() => handleToggle(source.key)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Eye size={20} className="text-gray-800" />
            Transparency & Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full justify-start">
            <Database size={16} className="mr-2" />
            View All Collected Data
          </Button>
          
          <Button variant="outline" className="w-full justify-start">
            <Wifi size={16} className="mr-2" />
            Export Data (JSON)
          </Button>
          
          <Button variant="destructive" className="w-full justify-start">
            <Trash2 size={16} className="mr-2" />
            Delete All Data
          </Button>
          
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Instant Deletion:</strong> Your data can be completely removed at any time with no delays or explanations required. 
              All processing happens locally on your device.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyDashboard;
