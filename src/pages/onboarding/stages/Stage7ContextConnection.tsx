import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Calendar, Activity, ArrowRight } from "lucide-react";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [wearableEnabled, setWearableEnabled] = useState(false);

  const handleComplete = () => {
    // Store context preferences
    localStorage.setItem('contextConnections', JSON.stringify({
      calendar: calendarEnabled,
      wearable: wearableEnabled,
      connectedAt: new Date().toISOString()
    }));
    
    navigate("/executive-home");
  };

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-headline font-bold">Connect Your Context</h2>
        <p className="text-lg text-muted-foreground">
          Help Mind Module understand your real-world patterns for personalized practice timing
        </p>
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Calendar Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Sync your calendar to identify high-stakes meetings and suggest relevant practice scenarios
                </p>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Coming soon: Google Calendar, Outlook, Apple Calendar
                </p>
              </div>
            </div>
            <Switch 
              checked={calendarEnabled} 
              onCheckedChange={setCalendarEnabled}
              disabled
            />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Wearable Data</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your wearable to track stress patterns and optimize practice timing
                </p>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Coming soon: Apple Health, Fitbit, Garmin, Whoop
                </p>
              </div>
            </div>
            <Switch 
              checked={wearableEnabled} 
              onCheckedChange={setWearableEnabled}
              disabled
            />
          </div>
        </Card>
      </div>

      <div className="bg-muted/50 border border-border rounded-xl p-6">
        <h4 className="font-semibold mb-2">🔒 Your Privacy Matters</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• All data encrypted end-to-end</li>
          <li>• No data sold or shared with third parties</li>
          <li>• You control what's connected and can disconnect anytime</li>
          <li>• Used only to personalize your Mind Module experience</li>
        </ul>
      </div>

      <Button size="lg" onClick={handleComplete} className="w-full">
        {calendarEnabled || wearableEnabled ? 'Save & Continue' : 'Skip for Now'}
        <ArrowRight size={20} className="ml-2" />
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        You can always connect these later in Settings
      </p>
    </div>
  );
}
