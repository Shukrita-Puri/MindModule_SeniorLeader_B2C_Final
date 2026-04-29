import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import DailyRitual from "@/components/home/DailyRitual";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { isRetakeForUser, isTourActiveForUser } from "@/utils/firstSessionTour";

const PlanPage = () => {
  const { user } = useAuth();
  const { recordStep } = useOnboardingProgress();
  const [prioritiesEmpty, setPrioritiesEmpty] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [searchParams] = useSearchParams();
  const expandReflection = searchParams.get('expand') === 'reflection';
  const reflectionContext = searchParams.get('context'); // 'post-event' | null
  const reflectionEvent = searchParams.get('event');
  const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);

  useEffect(() => {
    setShowGuide(isTourActiveForUser(effectiveId) || isRetakeForUser(effectiveId));
  }, [effectiveId]);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-background overflow-hidden">
        <LeftSidebar />
        <SidebarInset className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto">
          <div>
            <header className="relative z-40 flex items-center px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
              <SidebarDiscoveryPulse />
            </header>

            <div className="pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]">
              <div className="max-w-lg mx-auto px-3 md:px-4">
                <div className="pb-3 text-center">
                  <h1 className="text-[26px] sm:text-[28px] font-headline text-foreground tracking-tight">
                    Mental Performance Plan
                  </h1>
                  <p className="text-sm text-muted-foreground/70 mt-1 font-body">
                    Your priorities mapped based on your brief and for your day
                  </p>
                </div>
                <div data-tour="daily-plan">
                  <TodayThreePriorities
                    onEmpty={() => setPrioritiesEmpty(true)}
                    onLoaded={() => setPrioritiesEmpty(false)}
                    expandReflection={expandReflection}
                    reflectionContext={reflectionContext}
                    reflectionEvent={reflectionEvent}
                  />
                  {prioritiesEmpty && <DailyRitual />}
                </div>
              </div>
              <div className="mt-8 hidden sm:block">
                <PrivacyFooter />
              </div>
            </div>
          </div>
          {showGuide && (
            <FirstSessionGuide onComplete={() => {
              setShowGuide(false);
              recordStep('first_session_walkthrough', { completed: true });
            }} />
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PlanPage;
