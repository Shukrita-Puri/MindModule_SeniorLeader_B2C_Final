import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Calendar, Watch, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const ConnectedData = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // These would typically come from your database
  const connections = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      icon: Calendar,
      description: 'Sync your calendar for contextual recommendations',
      connected: false,
    },
    {
      id: 'apple-watch',
      name: 'Apple Watch',
      icon: Watch,
      description: 'Connect via Apple Health for HRV and sleep data',
      connected: false,
    },
    {
      id: 'oura',
      name: 'Oura Ring',
      icon: Watch,
      description: 'Connect your Oura for sleep and readiness data',
      connected: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 safe-area-top bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-headline font-semibold">Connected Data</h1>
            <p className="text-sm text-muted-foreground">Manage your data sources</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Info Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Link2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground">Why connect your data?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connecting your calendar and wearables allows us to provide personalized recommendations 
                  based on your schedule, sleep quality, and readiness levels.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connections */}
        <div className="space-y-4">
          <h2 className="text-lg font-headline font-semibold">Data Sources</h2>
          
          {connections.map((connection) => (
            <Card key={connection.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      <connection.icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {connection.name}
                        {connection.connected ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">{connection.description}</p>
                    </div>
                  </div>
                  <Button variant={connection.connected ? "outline" : "default"} size="sm">
                    {connection.connected ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Data Privacy Note */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data Privacy</CardTitle>
            <CardDescription>
              Your data is encrypted and never shared with third parties. You can disconnect 
              any source at any time and request complete data deletion.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
};

export default ConnectedData;
