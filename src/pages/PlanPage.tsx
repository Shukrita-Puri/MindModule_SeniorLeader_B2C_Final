import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import TourMockPlan from "@/components/onboarding/TourMockPlan";
import { useTourMock } from "@/components/onboarding/useTourMock";

import TodayHero from "@/components/today/TodayHero";
import TodayGreeting from "@/components/today/TodayGreeting";
import DailyRitual from "@/components/home/DailyRitual";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { isRetakeForUser, isTourActiveForUser } from "@/utils/firstSessionTour";

const PlanPage = () => {
  const { user } = useAuth();
  const { recordStep } = useOnboardingProgress();
  const navigate = useNavigate();
  const [prioritiesEmpty, setPrioritiesEmpty] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [searchParams] = useSearchParams();
  const expandReflection = searchParams.get('expand') === 'reflection';
  const reflectionContext = searchParams.get('context'); // 'post-event' | null
  const reflectionEvent = searchParams.get('event');
  const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
  // Tour mock — render best-in-class demo priorities for genuine
  // first-time users while the App Tour is active. Strict gating in
  // useTourMock (active flag + first-time user). Real plan + completion
  // logic stay untouched.
  const { shouldRenderMock: showTourMockPlan } = useTourMock();

  useEffect(() => {
    setShowGuide(isTourActiveForUser(effectiveId) || isRetakeForUser(effectiveId));
  }, [effectiveId]);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-transparent overflow-hidden">
        <LeftSidebar />
        <SidebarInset className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto">
          <div>
            <div className="relative">
              <TodayHero />
              <TodayGreeting />
              <header className="absolute top-0 left-0 right-0 z-40 flex items-center px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
                <SidebarDiscoveryPulse />
              </header>
            </div>
            

            <div className="pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]">
              <div className="max-w-2xl mx-auto md:px-4">
                <h1 className="sr-only">Mental Performance Plan</h1>
                <div data-tour="daily-plan" className="relative overflow-hidden rounded-t-2xl md:rounded-2xl px-1 py-5
                  bg-white
                  border border-[#cfc7b8]
                  shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="mb-3 px-3 flex items-center justify-between">
                    <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))]">
                      Today's Performance Priorities
                    </span>
                    <span className="text-caption text-[hsl(var(--muted-foreground-v2))]">
                      Mental Performance Plan
                    </span>
                  </div>
                  <div>
                    {showTourMockPlan ? (
                      <TourMockPlan />
                    ) : (
                      <>
                        <TodayThreePriorities
                          onEmpty={() => setPrioritiesEmpty(true)}
                          onLoaded={() => setPrioritiesEmpty(false)}
                          expandReflection={expandReflection}
                          reflectionContext={reflectionContext}
                          reflectionEvent={reflectionEvent}
                        />
                        {prioritiesEmpty && <DailyRitual />}
                      </>
                    )}
                  </div>
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
              navigate('/daily-check-in', { replace: true });
            }} />
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PlanPage;
