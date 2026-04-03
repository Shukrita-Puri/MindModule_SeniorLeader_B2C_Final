import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Brain, Compass, BarChart3, HeartPulse } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SIDEBAR_OPEN_COUNT_KEY = "sidebar_open_count";
const PULSE_THRESHOLD = 3;

const FEATURES = [
  {
    icon: Brain,
    label: "Mind Coach",
    description: "Your thinking partner",
    path: "/coach",
  },
  {
    icon: Compass,
    label: "Reset Studio",
    description: "Recalibrate and restore",
    path: "/recalibrate",
  },
  {
    icon: BarChart3,
    label: "Performance Intelligence",
    description: "Your patterns",
    path: "/insights",
  },
  {
    icon: HeartPulse,
    label: "Performance Readiness",
    description: "Your daily check-in",
    path: "/daily-check-in",
  },
];

const ACCENT_COLOR = "#FF8C42";

const SidebarDiscoveryPulse = () => {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const [openCount, setOpenCount] = useState(() => {
    return parseInt(localStorage.getItem(SIDEBAR_OPEN_COUNT_KEY) || "0", 10);
  });
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [prevState, setPrevState] = useState(state);

  const shouldPulse = openCount < PULSE_THRESHOLD;

  useEffect(() => {
    if (state === "expanded" && prevState === "collapsed") {
      const newCount = openCount + 1;
      setOpenCount(newCount);
      localStorage.setItem(SIDEBAR_OPEN_COUNT_KEY, String(newCount));

      if (newCount <= PULSE_THRESHOLD) {
        setShowDiscovery(true);
      }
    }
    setPrevState(state);
  }, [state, prevState, openCount]);

  const handleFeatureClick = (path: string) => {
    setShowDiscovery(false);
    navigate(path);
  };

  return (
    <>
      <style>{`
        @keyframes discovery-ping-1 {
          0% {
            transform: scale(1);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.9);
            opacity: 0;
          }
        }
        @keyframes discovery-ping-2 {
          0% {
            transform: scale(1);
            opacity: 0;
          }
          33% {
            opacity: 0;
            transform: scale(1);
          }
          33.1% {
            opacity: 0.7;
            transform: scale(1);
          }
          100% {
            transform: scale(2.1);
            opacity: 0;
          }
        }
      `}</style>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            {shouldPulse && (
              <>
                <span
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: "-6px",
                    animation: "discovery-ping-1 1.8s ease-out infinite",
                    border: `2.5px solid ${ACCENT_COLOR}`,
                  }}
                />
                <span
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: "-6px",
                    animation: "discovery-ping-2 1.8s ease-out infinite",
                    border: `2.5px solid ${ACCENT_COLOR}`,
                  }}
                />
              </>
            )}
            <SidebarTrigger
              data-tour="sidebar-trigger"
              className="h-9 w-9 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20 relative z-10"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Explore your mental performance suite</p>
        </TooltipContent>
      </Tooltip>

      <Sheet open={showDiscovery} onOpenChange={setShowDiscovery}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8 pt-6 max-h-[60vh]">
          <h3 className="text-lg font-headline font-semibold text-foreground mb-1">
            Explore your performance suite
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            Your toolkit for peak performance
          </p>
          <div className="space-y-3">
            {FEATURES.map((feature) => (
              <button
                key={feature.path}
                onClick={() => handleFeatureClick(feature.path)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-accent/50 transition-all text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default SidebarDiscoveryPulse;
