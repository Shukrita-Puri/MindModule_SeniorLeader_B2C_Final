import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import DailyRitual from "@/components/home/DailyRitual";
import PrivacyFooter from "@/components/home/PrivacyFooter";

const PlanPage = () => {
  const [prioritiesEmpty, setPrioritiesEmpty] = useState(false);
  const [searchParams] = useSearchParams();
  const expandReflection = searchParams.get('expand') === 'reflection';
  const reflectionContext = searchParams.get('context'); // 'post-event' | null
  const reflectionEvent = searchParams.get('event');

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        <LeftSidebar />
        <SidebarInset className="w-full overflow-x-hidden overflow-y-auto">
          <div className="pt-[env(safe-area-inset-top,0px)]">
            <header className="flex items-center px-3 md:px-4 py-3">
              <SidebarDiscoveryPulse />
            </header>

            <div className="pb-[100px]">
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
              <div className="mt-8">
                <PrivacyFooter />
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PlanPage;
