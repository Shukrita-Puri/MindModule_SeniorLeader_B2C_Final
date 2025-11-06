
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldCard } from "@/components/ui/gold-card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Smartphone, Lock, Database, Calendar, Mail, Watch, MessageCircle, FileText, User } from "lucide-react";
import { ProviderSelector } from "@/components/onboarding/ProviderSelector";
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/hooks/useAuth';

interface DataConnection {
  enabled: boolean;
  provider: string | null;
}

const PrivacyDashboard = () => {
  const { user } = useAuth();
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
    // Load connection data
    const stored = localStorage.getItem('contextConnections');
    if (stored) {
      const data = JSON.parse(stored);
      setConnections({
        calendar: data.calendar || { enabled: false, provider: null },
        wearable: data.wearable || { enabled: false, provider: null }
      });
    }

    // Load personal info or populate from auth user
    const storedInfo = localStorage.getItem('personalInfo');
    if (storedInfo) {
      setPersonalInfo(JSON.parse(storedInfo));
    } else if (user) {
      // Auto-populate from Supabase auth
      setPersonalInfo({
        fullName: user.user_metadata?.full_name || '',
        email: user.email || '',
        preferredName: user.user_metadata?.full_name?.split(' ')[0] || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
  }, [user]);

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
      <GoldCard variant="glowing" className="bg-gradient-to-br from-green-50/80 to-card/80 backdrop-blur-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Smartphone size={20} className="text-saffron" />
            Local-First Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-saffron rounded-full"></div>
              <span className="text-sm text-foreground">Your data stays on this device</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-taupe" />
              <span className="text-sm text-foreground">End-to-end encrypted insights</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-taupe" />
              <span className="text-sm text-foreground">No cloud storage of personal data</span>
            </div>
          </div>
        </CardContent>
      </GoldCard>

      {/* Biometric Security */}
      <GoldCard variant="subtle">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Lock size={20} className="text-taupe" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Biometric Lock</p>
              <p className="text-sm text-muted-foreground">Require Face ID/Touch ID to access insights</p>
            </div>
            <Switch 
              checked={biometricLock} 
              onCheckedChange={setBiometricLock}
              className="data-[state=checked]:bg-taupe"
            />
          </div>
        </CardContent>
      </GoldCard>

      {/* Personal Information */}
      <GoldCard variant="subtle">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <User size={20} className="text-taupe" />
            Personal Information
            {user && <Badge variant="outline" className="text-xs border-taupe/30 text-taupe">Synced with auth</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
            <Input
              id="fullName"
              value={personalInfo.fullName}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, fullName: e.target.value }))}
              placeholder="Enter your full name"
              className="bg-white/40 backdrop-blur-xl border-taupe/20 focus:border-taupe"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={personalInfo.email}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your.email@example.com"
              className="bg-white/40 backdrop-blur-xl border-taupe/20 focus:border-taupe"
              readOnly={!!user?.email}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferredName" className="text-foreground">Preferred Name</Label>
            <Input
              id="preferredName"
              value={personalInfo.preferredName}
              onChange={(e) => setPersonalInfo(prev => ({ ...prev, preferredName: e.target.value }))}
              placeholder="How should we greet you?"
              className="bg-white/40 backdrop-blur-xl border-taupe/20 focus:border-taupe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-foreground">Timezone</Label>
            <Input
              id="timezone"
              value={personalInfo.timezone}
              readOnly
              className="bg-muted/40 backdrop-blur-xl border-taupe/20"
            />
          </div>

          <Button 
            onClick={handleSavePersonalInfo} 
            className="w-full bg-white/30 backdrop-blur-xl border border-taupe/30 hover:bg-white/50 text-foreground taupe-gradient-shine"
          >
            Save Changes
          </Button>
        </CardContent>
      </GoldCard>

      {/* Data Sources */}
      <GoldCard variant="prominent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Database size={20} className="text-taupe" />
            Data Sources
            <Badge variant="outline" className="ml-2 border-taupe/30 text-taupe">Full Control</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Calendar - Available */}
          <div className="p-4 rounded-lg bg-white/30 backdrop-blur-xl border border-taupe/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-saffron" />
                <div>
                  <p className="font-medium text-sm text-foreground">Calendar</p>
                  <p className="text-xs text-muted-foreground">Meeting patterns and scheduling insights</p>
                </div>
              </div>
              <Switch 
                checked={connections.calendar.enabled} 
                onCheckedChange={(checked) => handleConnectionToggle('calendar', checked)}
                className="data-[state=checked]:bg-taupe"
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
          <div className="p-4 rounded-lg bg-white/30 backdrop-blur-xl border border-taupe/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Watch className="h-5 w-5 text-saffron" />
                <div>
                  <p className="font-medium text-sm text-foreground">Wearable Data</p>
                  <p className="text-xs text-muted-foreground">Biometric and activity patterns</p>
                </div>
              </div>
              <Switch 
                checked={connections.wearable.enabled} 
                onCheckedChange={(checked) => handleConnectionToggle('wearable', checked)}
                className="data-[state=checked]:bg-taupe"
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
          <div className="p-4 rounded-lg bg-white/10 backdrop-blur-xl border border-dashed border-taupe/20 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2 text-foreground">
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
          <div className="p-4 rounded-lg bg-white/10 backdrop-blur-xl border border-dashed border-taupe/20 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2 text-foreground">
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
          <div className="p-4 rounded-lg bg-white/10 backdrop-blur-xl border border-dashed border-taupe/20 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm flex items-center gap-2 text-foreground">
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
      </GoldCard>
    </div>
  );
};

export default PrivacyDashboard;
