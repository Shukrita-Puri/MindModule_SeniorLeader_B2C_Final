import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar, Activity, CheckCircle2, XCircle } from "lucide-react";
import { ProviderSelector } from "@/components/onboarding/ProviderSelector";
import { IntegrationPreviewCard } from "@/components/onboarding/IntegrationPreviewCard";
import CalendarConnectionSettings from "@/components/CalendarConnectionSettings";
import { toast } from "@/hooks/use-toast";
import { isNativeApp, requestHealthKitPermissions } from "@/utils/healthKitCapacitor";

interface ContextConnections {
  calendar: {
    enabled: boolean;
    provider: string | null;
    setupCompletedAt: string | null;
  };
  wearable: {
    enabled: boolean;
    provider: string | null;
    setupCompletedAt: string | null;
  };
}

export default function IntegrationSettings() {
  const [connections, setConnections] = useState<ContextConnections>({
    calendar: { enabled: false, provider: null, setupCompletedAt: null },
    wearable: { enabled: false, provider: null, setupCompletedAt: null }
  });

  useEffect(() => {
    const stored = localStorage.getItem('contextConnections');
    if (stored) {
      const data = JSON.parse(stored);
      setConnections({
        calendar: data.calendar || { enabled: false, provider: null, setupCompletedAt: null },
        wearable: data.wearable || { enabled: false, provider: null, setupCompletedAt: null }
      });
    }
  }, []);

  const handleCalendarToggle = (checked: boolean) => {
    setConnections(prev => ({
      ...prev,
      calendar: { ...prev.calendar, enabled: checked }
    }));
    
    if (checked) {
      toast({
        title: "Calendar Integration Enabled",
        description: "Select your calendar provider to continue setup.",
      });
    } else {
      toast({
        title: "Calendar Integration Disabled",
        description: "You can re-enable this anytime.",
      });
    }
  };

  const handleWearableToggle = async (checked: boolean) => {
    if (checked && isNativeApp()) {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        toast({
          title: "Permission Required",
          description: "HealthKit access is needed for wearable integration.",
          variant: "destructive",
        });
        return;
      }
    }

    setConnections(prev => ({
      ...prev,
      wearable: { ...prev.wearable, enabled: checked }
    }));
    
    if (checked) {
      toast({
        title: isNativeApp() ? "Apple Watch Connected" : "Wearable Integration Enabled",
        description: isNativeApp() ? "HealthKit data will be used for insights." : "Select your device to continue setup.",
      });
    } else {
      toast({
        title: "Wearable Integration Disabled",
        description: "You can re-enable this anytime.",
      });
    }
  };

  const handleSave = () => {
    localStorage.setItem('contextConnections', JSON.stringify({
      ...connections,
      lastUpdated: new Date().toISOString()
    }));
    
    toast({
      title: "Settings Saved",
      description: "Your integration preferences have been updated.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[15px] font-medium mb-2">Data Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect your calendar and wearable devices for context-aware recommendations
        </p>
      </div>

      {/* Calendar Integration with OAuth */}
      <CalendarConnectionSettings />

      {/* Wearable Integration */}
      <Card className={`p-5 transition-all ${
        connections.wearable.enabled ? 'border-gold/40' : ''
      }`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex gap-3 flex-1">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center flex-shrink-0">
              <Activity className="w-6 h-6 text-gold" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold">Wearable</h4>
                {connections.wearable.setupCompletedAt && (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {connections.wearable.provider 
                  ? `Connected to ${connections.wearable.provider}`
                  : 'Sync biometric data for proactive stress management'
                }
              </p>
            </div>
          </div>
          <Switch 
            checked={connections.wearable.enabled} 
            onCheckedChange={handleWearableToggle}
          />
        </div>

        {connections.wearable.enabled && (
          <div className="space-y-4">
            <ProviderSelector 
              type="wearable"
              selectedProvider={connections.wearable.provider}
              onSelect={(provider) => 
                setConnections(prev => ({
                  ...prev,
                  wearable: { 
                    ...prev.wearable, 
                    provider,
                    setupCompletedAt: new Date().toISOString()
                  }
                }))
              }
            />
            {connections.wearable.provider && (
              <IntegrationPreviewCard type="wearable" />
            )}
          </div>
        )}
      </Card>

      <Button onClick={handleSave} className="w-full">
        Save Changes
      </Button>
    </div>
  );
}
