import { useState } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import DailyRitual from "@/components/home/DailyRitual";
import PrivacyFooter from "@/components/home/PrivacyFooter";

const PlanPage = () => {
  const [prioritiesEmpty, setPrioritiesEmpty] = useState(false);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        <LeftSidebar />
        <SidebarInset className="w-full overflow-x-hidden overflow-y-auto">
          <div className="pt-[env(safe-area-inset-top,0px)]">
            <header className="px-4 md:px-6 pt-6 pb-4 max-w-lg mx-auto">
              <h1 className="text-[22px] sm:text-2xl font-headline text-foreground tracking-tight">
                Today's Plan
              </h1>
              <p className="text-[13px] text-muted-foreground/70 mt-1 font-body">
                Your performance priorities for today
              </p>
            </header>

            <div className="pb-[100px]">
              <div data-tour="daily-plan">
                <TodayThreePriorities
                  onEmpty={() => setPrioritiesEmpty(true)}
                  onLoaded={() => setPrioritiesEmpty(false)}
                />
                {prioritiesEmpty && <DailyRitual />}
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
