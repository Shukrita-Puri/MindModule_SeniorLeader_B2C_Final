
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Smartphone, Lock, Database, Calendar, Mail, Watch, MessageCircle, FileText, User } from "lucide-react";
import { ProviderSelector } from "@/components/onboarding/ProviderSelector";
import { toast } from "@/hooks/use-toast";

interface DataConnection {
  enabled: boolean;
  provider: string | null;
}

const PrivacyDashboard = () => {
  const [connections, setConnections] = useState({
    calendar: { enabled: false, provider: null } as DataConnection,
    wearable: { enabled: false, provider: null } as DataConnection,
  });

  const [biometricLock, setBiometricLock] = useState(true);
  const [personalInfo, setPersonalInfo] = useState({
    fullName: "",
    email: "",
    preferredName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  useEffect(() => {
    const stored = localStorage.getItem('contextConnections');
    if (stored) {
      const data = JSON.parse(stored);
      setConnections({
        calendar: data.calendar || { enabled: false, provider: null },
        wearable: data.wearable || { enabled: false, provider: null }
      });
    }

    const storedInfo = localStorage.getItem('personalInfo');
    if (storedInfo) {
      setPersonalInfo(JSON.parse(storedInfo));
    }
  }, []);

  const handleConnectionToggle = (key: 'calendar' | 'wearable', checked: boolean) => {
    setConnections(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: checked }
    }));
    
    const updated = {
      ...connections,
      [key]: { ...connections[key], enabled: checked }
    };
    localStorage.setItem('contextConnections', JSON.stringify(updated));
    
    toast({
      title: checked ? "Integration Enabled" : "Integration Disabled",
      description: checked 
        ? `Select your ${key} provider to continue setup.`
        : `You can re-enable this anytime.`,
    });
  };

  const handleProviderSelect = (key: 'calendar' | 'wearable', provider: string) => {
    setConnections(prev => ({
      ...prev,
      [key]: { enabled: true, provider }
    }));
    
    const updated = {
      ...connections,
      [key]: { enabled: true, provider }
    };
    localStorage.setItem('contextConnections', JSON.stringify(updated));
  };

  const handleSavePersonalInfo = () => {
    localStorage.setItem('personalInfo', JSON.stringify(personalInfo));
    toast({
      title: "Profile Updated",
      description: "Your personal information has been saved.",
    });
  };

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

      {/* Personal Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <User size={20} />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={personalInfo.fullName}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, fullName: e.target.value }))}
              placeholder="Enter your full name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={personalInfo.email}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your.email@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferredName">Preferred Name</Label>
            <Input
              id="preferredName"
              value={personalInfo.preferredName}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, preferredName: e.target.value }))}
              placeholder="How should we greet you?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={personalInfo.timezone}
              readOnly
              className="bg-muted"
            />
          </div>

          <Button onClick={handleSavePersonalInfo} className="w-full">
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database size={20} />
            Data Sources
            <Badge variant="outline" className="ml-2">Full Control</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Calendar - Available */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gold" />
                <div>
                  <p className="font-medium text-sm">Calendar</p>
                  <p className="text-xs text-muted-foreground">Meeting patterns and scheduling insights</p>
                </div>
              </div>
              <Switch 
                checked={connections.calendar.enabled} 
                onCheckedChange={(checked) => handleConnectionToggle('calendar', checked)}
              />
            </div>
            {connections.calendar.enabled && (
              <div className="mt-3">
                <ProviderSelector 
                  type="calendar"
                  selectedProvider={connections.calendar.provider}
                  onSelect={(provider) => handleProviderSelect('calendar', provider)}
                />
              </div>
            )}
          </div>

          {/* Wearable - Available */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Watch className="h-5 w-5 text-gold" />
                <div>
                  <p className="font-medium text-sm">Wearable Data</p>
                  <p className="text-xs text-muted-foreground">Biometric and activity patterns</p>
                </div>
              </div>
              <Switch 
                checked={connections.wearable.enabled} 
                onCheckedChange={(checked) => handleConnectionToggle('wearable', checked)}
              />
            </div>
            {connections.wearable.enabled && (
              <div className="mt-3">
                <ProviderSelector 
                  type="wearable"
                  selectedProvider={connections.wearable.provider}
                  onSelect={(provider) => handleProviderSelect('wearable', provider)}
                />
              </div>
            )}
          </div>

          {/* Email - Coming Soon */}
          <div className="p-4 rounded-lg border border-dashed opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    Email Data
                    <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">Sentiment and tone detection</p>
                </div>
              </div>
              <Switch disabled />
            </div>
          </div>

          {/* Social - Coming Soon */}
          <div className="p-4 rounded-lg border border-dashed opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    Social Data
                    <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">Communications and sentiment analysis</p>
                </div>
              </div>
              <Switch disabled />
            </div>
          </div>

          {/* Documents - Coming Soon */}
          <div className="p-4 rounded-lg border border-dashed opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    Document Access
                    <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">Knowledge work patterns</p>
                </div>
              </div>
              <Switch disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyDashboard;
