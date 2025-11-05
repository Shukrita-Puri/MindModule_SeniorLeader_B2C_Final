import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, Activity, ArrowRight, Sparkles, TrendingUp, Shield, Lock, Eye, Database } from "lucide-react";
import { GoldDivider } from "@/components/ui/divider";
import { ProviderSelector } from "@/components/onboarding/ProviderSelector";
import { IntegrationPreviewCard } from "@/components/onboarding/IntegrationPreviewCard";
import { toast } from "@/hooks/use-toast";
import { getSession } from "@/utils/onboardingStorage";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Stage7ContextConnection() {
  const navigate = useNavigate();
  const [calendarConfig, setCalendarConfig] = useState({
    enabled: false,
    provider: null as string | null,
    waitlist: false
  });
  const [wearableConfig, setWearableConfig] = useState({
    enabled: false,
    provider: null as string | null,
    waitlist: false
  });

  const handleCalendarToggle = (checked: boolean) => {
    setCalendarConfig(prev => ({ ...prev, enabled: checked }));
    if (checked) {
      toast({
        title: "🎉 Excellent Choice!",
        description: "Calendar integration unlocks context-aware practice suggestions.",
      });
    }
  };

  const handleWearableToggle = (checked: boolean) => {
    setWearableConfig(prev => ({ ...prev, enabled: checked }));
    if (checked) {
      toast({
        title: "🎉 Smart Move!",
        description: "Biometric data enables proactive stress management.",
      });
    }
  };

  const handleComplete = () => {
    localStorage.setItem('contextConnections', JSON.stringify({
      calendar: {
        enabled: calendarConfig.enabled,
        provider: calendarConfig.provider,
        waitlist: calendarConfig.waitlist,
        setupCompletedAt: calendarConfig.enabled ? new Date().toISOString() : null
      },
      wearable: {
        enabled: wearableConfig.enabled,
        provider: wearableConfig.provider,
        waitlist: wearableConfig.waitlist,
        setupCompletedAt: wearableConfig.enabled ? new Date().toISOString() : null
      },
      onboardingCompletedAt: new Date().toISOString(),
      plan: 'super-pro'
    }));
    
    // Mark onboarding as complete
    const session = getSession();
    if (session) {
      session.responses.onboardingCompleted = true;
      session.responses.completedAt = new Date().toISOString();
      localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
    }
    
    navigate("/daily-check-in");
  };

  const getButtonText = () => {
    if (calendarConfig.enabled && wearableConfig.enabled) return 'Connect Both & Continue';
    if (calendarConfig.enabled) return 'Connect Calendar & Continue';
    if (wearableConfig.enabled) return 'Connect Wearable & Continue';
    if (calendarConfig.waitlist || wearableConfig.waitlist) return 'Join Waitlist & Continue';
    return 'Skip for Now';
  };

  return (
    <div className="relative min-h-screen">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 space-y-8 py-8 animate-fade-in">
        {/* Super Pro Exclusive Badge */}
        <div className="bg-gradient-to-r from-gold/20 to-primary/20 border border-gold/30 rounded-xl p-4 animate-fade-in delay-100">
          <div className="flex items-center gap-2 justify-center">
            <Sparkles className="text-gold" size={20} />
            <span className="font-semibold text-gold">Super Pro Exclusive Feature</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in delay-200">
          <h2 className="text-4xl md:text-5xl font-headline font-bold">
            Connect Your <span className="text-gold">Context</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Enable intelligent, context-aware practice timing based on your real-world patterns
          </p>
        </div>

        <GoldDivider />

        {/* Comparison Callout */}
        <Card className="p-5 border-gold/30 bg-gradient-to-br from-gold/5 to-transparent animate-fade-in delay-300">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-gold/20 flex-shrink-0">
              <TrendingUp className="text-gold" size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">Why Super Pro Users Love This</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Pro users practice when they remember. Super Pro users practice when it matters most.
              </p>
              <div className="text-sm space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                  <span><strong>3x</strong> more consistent practice habit formation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                  <span><strong>67%</strong> better transfer to real-world situations</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                  <span>Proactive support during high-stress moments</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Calendar Integration Card */}
        <Card className={`p-6 transition-all duration-300 animate-fade-in delay-400 ${
          calendarConfig.enabled ? 'border-gold/40 bg-card/90 shadow-lg' : 'bg-card/80'
        } backdrop-blur-sm`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex gap-4 flex-1">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-7 h-7 text-gold" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-xl mb-2">Calendar Integration</h3>
                <div className="space-y-2 text-sm text-muted-foreground mb-3">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Identifies "Board Meeting" → suggests "Confident Leadership" practice 30min before</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Detects "Difficult Conversation" → auto-recommends "Emotional Regulation" scenario</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Notices back-to-back meetings → nudges "Emergency Reset" during 5min gap</span>
                  </div>
                </div>
              </div>
            </div>
            <Switch 
              checked={calendarConfig.enabled} 
              onCheckedChange={handleCalendarToggle}
            />
          </div>

          {calendarConfig.enabled && (
            <>
              <ProviderSelector 
                type="calendar"
                selectedProvider={calendarConfig.provider}
                onSelect={(provider) => setCalendarConfig(prev => ({ ...prev, provider }))}
              />
              {calendarConfig.provider && (
                <>
                  <IntegrationPreviewCard type="calendar" />
                  {['microsoft', 'apple'].includes(calendarConfig.provider) && (
                    <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={calendarConfig.waitlist}
                          onCheckedChange={(checked) => 
                            setCalendarConfig(prev => ({ ...prev, waitlist: checked as boolean }))
                          }
                        />
                        <span className="text-sm">
                          Notify me when {calendarConfig.provider === 'microsoft' ? 'Outlook' : 'Apple Calendar'} integration launches
                        </span>
                      </label>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Card>

        {/* Wearable Integration Card */}
        <Card className={`p-6 transition-all duration-300 animate-fade-in delay-500 ${
          wearableConfig.enabled ? 'border-gold/40 bg-card/90 shadow-lg' : 'bg-card/80'
        } backdrop-blur-sm`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex gap-4 flex-1">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center flex-shrink-0">
                <Activity className="w-7 h-7 text-gold" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-xl mb-2">Wearable Data</h3>
                <div className="space-y-2 text-sm text-muted-foreground mb-3">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>HRV drops below baseline → suggests "Breathwork Session" for quick recovery</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Sleep quality low → recommends shorter, gentler practices for the day</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>Stress spike detected → proactively offers "Pause & Reset" before your next task</span>
                  </div>
                </div>
              </div>
            </div>
            <Switch 
              checked={wearableConfig.enabled} 
              onCheckedChange={handleWearableToggle}
            />
          </div>

          {wearableConfig.enabled && (
            <>
              <ProviderSelector 
                type="wearable"
                selectedProvider={wearableConfig.provider}
                onSelect={(provider) => setWearableConfig(prev => ({ ...prev, provider }))}
              />
              {wearableConfig.provider && (
                <>
                  <IntegrationPreviewCard type="wearable" />
                  <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox 
                        checked={wearableConfig.waitlist}
                        onCheckedChange={(checked) => 
                          setWearableConfig(prev => ({ ...prev, waitlist: checked as boolean }))
                        }
                      />
                      <span className="text-sm">
                        Notify me when {wearableConfig.provider} integration launches
                      </span>
                    </label>
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        {/* Enhanced Privacy Section */}
        <div className="bg-muted/50 border border-border rounded-xl p-6 animate-fade-in delay-600">
          <div className="flex items-start gap-3 mb-4">
            <Shield className="text-gold mt-1" size={24} />
            <div>
              <h4 className="font-semibold text-lg mb-2">🔒 Your Privacy & Security</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Lock size={14} className="mt-1 flex-shrink-0 text-gold" />
                  <span>All data encrypted end-to-end with AES-256</span>
                </div>
                <div className="flex items-start gap-2">
                  <Eye size={14} className="mt-1 flex-shrink-0 text-gold" />
                  <span>You choose which calendars sync • Private events stay private</span>
                </div>
                <div className="flex items-start gap-2">
                  <Database size={14} className="mt-1 flex-shrink-0 text-gold" />
                  <span>No data sold or shared with third parties • Ever</span>
                </div>
                <div className="flex items-start gap-2">
                  <Activity size={14} className="mt-1 flex-shrink-0 text-gold" />
                  <span>Disconnect anytime with one click in Settings</span>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Accordion */}
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="disconnect">
              <AccordionTrigger className="text-sm font-medium">
                Can I disconnect later?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Yes! You can disconnect any integration with one click in Settings. No data is retained after disconnection.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="battery">
              <AccordionTrigger className="text-sm font-medium">
                Will this drain my phone battery?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                No. We use efficient background sync every 30 minutes, consuming minimal battery (less than 1% per day).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="data-access">
              <AccordionTrigger className="text-sm font-medium">
                What data do you access vs. NOT access?
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <div className="space-y-2">
                  <div>
                    <strong className="text-foreground">We access:</strong> Event titles, times, and duration (to suggest practices)
                  </div>
                  <div>
                    <strong className="text-foreground">We NEVER access:</strong> Event descriptions, attendees, locations, or any content marked private
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <Button size="lg" onClick={handleComplete} className="w-full animate-fade-in delay-700">
          {getButtonText()}
          <ArrowRight size={20} className="ml-2" />
        </Button>

        <p className="text-center text-sm text-muted-foreground animate-fade-in delay-700">
          You can always connect or modify these integrations later in Settings
        </p>
      </div>
    </div>
  );
}
