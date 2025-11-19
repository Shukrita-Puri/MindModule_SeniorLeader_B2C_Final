import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { GoldCard } from "@/components/ui/gold-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Lock, Watch, Activity, Calendar, Share2, Sparkles, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import CalendarConnectionSettings from "@/components/CalendarConnectionSettings";
import IntegrationSettings from "@/components/IntegrationSettings";

interface DataConnection {
  id: string;
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  status: 'connected' | 'not-connected';
}

const PrivacyDashboard = () => {
  const { user } = useAuth();
  const [preferredName, setPreferredName] = useState("");
  const [biometricLock, setBiometricLock] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Collapsible section states
  const [personalInfoOpen, setPersonalInfoOpen] = useState(() => 
    localStorage.getItem('account-section-personalInfo-open') !== 'false'
  );
  const [dataSourcesOpen, setDataSourcesOpen] = useState(() => 
    localStorage.getItem('account-section-dataSources-open') !== 'false'
  );
  const [privacyOpen, setPrivacyOpen] = useState(() => 
    localStorage.getItem('account-section-privacy-open') !== 'false'
  );
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => 
    localStorage.getItem('account-section-whatsNew-open') !== 'false'
  );
  const [referOpen, setReferOpen] = useState(() => 
    localStorage.getItem('account-section-refer-open') !== 'false'
  );

  const [connections, setConnections] = useState<DataConnection[]>([
    {
      id: 'apple-watch',
      name: 'Apple Watch',
      icon: <Watch className="h-4 w-4" />,
      enabled: false,
      status: 'not-connected'
    },
    {
      id: 'oura-ring',
      name: 'Oura Ring',
      icon: <Activity className="h-4 w-4" />,
      enabled: false,
      status: 'not-connected'
    },
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      icon: <Calendar className="h-4 w-4" />,
      enabled: false,
      status: 'not-connected'
    }
  ]);

  // Load saved settings
  useEffect(() => {
    const savedConnections = localStorage.getItem('dataConnections');
    if (savedConnections) {
      setConnections(JSON.parse(savedConnections));
    }

    const savedBiometric = localStorage.getItem('biometricLock');
    if (savedBiometric) {
      setBiometricLock(savedBiometric === 'true');
    }

    const savedPreferredName = localStorage.getItem('preferredName');
    if (savedPreferredName) {
      setPreferredName(savedPreferredName);
    }
  }, []);

  // Save collapsible states
  useEffect(() => {
    localStorage.setItem('account-section-personalInfo-open', personalInfoOpen.toString());
  }, [personalInfoOpen]);

  useEffect(() => {
    localStorage.setItem('account-section-dataSources-open', dataSourcesOpen.toString());
  }, [dataSourcesOpen]);

  useEffect(() => {
    localStorage.setItem('account-section-privacy-open', privacyOpen.toString());
  }, [privacyOpen]);

  useEffect(() => {
    localStorage.setItem('account-section-whatsNew-open', whatsNewOpen.toString());
  }, [whatsNewOpen]);

  useEffect(() => {
    localStorage.setItem('account-section-refer-open', referOpen.toString());
  }, [referOpen]);

  const handleConnectionToggle = (id: string) => {
    const updatedConnections = connections.map(conn =>
      conn.id === id 
        ? { 
            ...conn, 
            enabled: !conn.enabled,
            status: !conn.enabled ? 'connected' : 'not-connected' as 'connected' | 'not-connected'
          } 
        : conn
    );
    setConnections(updatedConnections);
    localStorage.setItem('dataConnections', JSON.stringify(updatedConnections));
    
    const connection = connections.find(c => c.id === id);
    toast.success(`${connection?.name} ${!connection?.enabled ? 'connected' : 'disconnected'}`);
  };

  const handleSavePreferredName = () => {
    localStorage.setItem('preferredName', preferredName);
    toast.success("Preferred name saved");
  };

  const handleCopyReferralLink = () => {
    const referralLink = `https://mindatelier.app/ref/${user?.id || 'demo'}`;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Personal Information Section */}
      <Collapsible open={personalInfoOpen} onOpenChange={setPersonalInfoOpen}>
        <GoldCard variant="subtle" className="overflow-hidden">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/5 transition-colors">
            <h3 className="text-xl font-semibold text-foreground">Personal Information</h3>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${personalInfoOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-muted-foreground">Full Name</Label>
                <Input 
                  id="fullName" 
                  value={user?.name || user?.email || ''} 
                  readOnly 
                  className="bg-muted/30"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                <Input 
                  id="email" 
                  value={user?.email || ''} 
                  readOnly 
                  className="bg-muted/30"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="preferredName" className="text-muted-foreground">Preferred Name (editable)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="preferredName" 
                    value={preferredName} 
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="Enter your preferred name"
                  />
                  <Button 
                    onClick={handleSavePreferredName}
                    className="bg-gradient-to-r from-taupe via-taupe-light to-taupe hover:opacity-90"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </GoldCard>
      </Collapsible>

      {/* Connected Data Sources Section */}
      <Collapsible open={dataSourcesOpen} onOpenChange={setDataSourcesOpen}>
        <GoldCard variant="prominent" className="overflow-hidden">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/5 transition-colors">
            <h3 className="text-xl font-semibold text-foreground">Connected Data Sources</h3>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${dataSourcesOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-6">
              {/* Calendar Integration */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-foreground">Calendar</h4>
                <CalendarConnectionSettings />
              </div>
              
              {/* Other Integrations */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-foreground">Wearable Devices</h4>
                <IntegrationSettings />
              </div>
            </div>
          </CollapsibleContent>
        </GoldCard>
      </Collapsible>

      {/* Privacy & Security Section */}
      <Collapsible open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <GoldCard variant="glowing" className="overflow-hidden">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/5 transition-colors">
            <h3 className="text-xl font-semibold text-foreground">Privacy & Security</h3>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${privacyOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-6">
              {/* Local-First Architecture */}
              <Card className="bg-gradient-to-br from-taupe/5 to-taupe-light/5 border-taupe/20">
                <div className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-taupe/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-taupe" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">Local-First Architecture</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your data lives on your device. No cloud storage, no external servers.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-forest" />
                      <span>Fully encrypted on your device</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-forest" />
                      <span>Zero data collection by Mind Atelier</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-forest" />
                      <span>You control all integrations</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Biometric Lock */}
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="font-medium text-foreground">Biometric Lock</p>
                  <p className="text-sm text-muted-foreground">Require Face ID or fingerprint to access</p>
                </div>
                <Switch 
                  checked={biometricLock}
                  onCheckedChange={(checked) => {
                    setBiometricLock(checked);
                    localStorage.setItem('biometricLock', checked.toString());
                  }}
                />
              </div>
            </div>
          </CollapsibleContent>
        </GoldCard>
      </Collapsible>

      {/* What's New Section */}
      <Collapsible open={whatsNewOpen} onOpenChange={setWhatsNewOpen}>
        <GoldCard variant="subtle" className="overflow-hidden">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              <h3 className="text-xl font-semibold text-foreground">What's New</h3>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${whatsNewOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                  <Badge variant="outline" className="bg-forest/10 text-forest border-forest/30">New</Badge>
                  <div>
                    <p className="font-medium text-foreground">Insights Dashboard</p>
                    <p className="text-sm text-muted-foreground">Track your practice patterns and energy trends</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                  <Badge variant="outline" className="bg-gold/10 text-gold border-gold/30">Soon</Badge>
                  <div>
                    <p className="font-medium text-foreground">Dialogue Room</p>
                    <p className="text-sm text-muted-foreground">AI-powered conversations for mental clarity</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                  <Badge variant="outline">v1.0.0</Badge>
                  <div>
                    <p className="font-medium text-foreground">Current Version</p>
                    <p className="text-sm text-muted-foreground">Released: January 2025</p>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </GoldCard>
      </Collapsible>

      {/* Refer to Friends Section */}
      <Collapsible open={referOpen} onOpenChange={setReferOpen}>
        <GoldCard variant="prominent" className="overflow-hidden">
          <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Refer to Friends</h3>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${referOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Share Mind Atelier with your friends and help them discover their mental architecture.
              </p>
              
              <div className="space-y-2">
                <Label className="text-muted-foreground">Your Referral Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={`https://mindatelier.app/ref/${user?.id || 'demo'}`}
                    readOnly 
                    className="bg-muted/30"
                  />
                  <Button 
                    onClick={handleCopyReferralLink}
                    variant="outline"
                    className="shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </GoldCard>
      </Collapsible>
    </div>
  );
};

export default PrivacyDashboard;
