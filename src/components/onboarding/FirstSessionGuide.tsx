/**
 * First Session Spotlight Walkthrough
 * 
 * A 10-step guided tour that highlights real UI elements on the actual pages.
 * Phase A (steps 0-4): Core daily loop — starts on /daily-check-in, moves to /executive-home
 * Phase B (steps 5-9): Navigation features — all on /executive-home
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSidebar } from '@/components/ui/sidebar';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { X, ArrowRight, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GuideStep {
  targetSelector: string; // CSS selector or 'fullscreen'
  title: string;
  body: string;
  page: 'check-in' | 'home';
  phase: 'A' | 'B';
  phaseLabel: string;
  openSidebar?: boolean;
  closeSidebar?: boolean;
}

const STEPS: GuideStep[] = [
  {
    targetSelector: '[data-tour="check-in-carousel"]',
    title: 'Performance Readiness Assessment',
    body: 'One tap to tell the system how you\'re performing right now. This is where every day starts.',
    page: 'check-in',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="today-state"]',
    title: 'Your State — Decision Readiness Score',
    body: 'Your check-in becomes a score — how sharp, steady, and ready you are right now.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="compass"]',
    title: 'Your Compass — Outer Readiness Brief',
    body: 'Your calendar, energy, and patterns shape a strategic read on your day. What to lean on. What to watch for.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Your Action — Performance Readiness Plan',
    body: 'Practices and sessions built for today — designed to close the gap between where you are and where the day needs you to be.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: 'fullscreen',
    title: 'The System Learns',
    body: 'Every practice you complete feeds back. Over time, it learns what works for you and adapts.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="sidebar-trigger"]',
    title: 'Your Menu',
    body: 'Open this to access all your features — Assessment, Reset Studio, Coach, and Intelligence.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
  },
  {
    targetSelector: '[data-tour="sidebar-nav"]',
    title: 'Your Mental Performance Suite',
    body: 'Performance Readiness Assessment · Reset Studio · Mind Performance Coach · Performance Intelligence — your core tools, always one tap away.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    openSidebar: true,
  },
  {
    targetSelector: '[data-tour="coach-access"]',
    title: 'Mind Performance Coach',
    body: 'Instant AI-powered coaching — available from any screen. Built around your patterns and context.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    closeSidebar: true,
  },
  {
    targetSelector: 'fullscreen',
    title: 'Connect Your Data',
    body: 'Go to Profile → Connected Data to sync Google Calendar and Apple Health. This syncs automatically every 6 hours — but you can always manually sync if you want updates sooner. The more context, the sharper your system.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
  },
  {
    targetSelector: 'fullscreen',
    title: 'You\'re Ready',
    body: 'Start with your first check-in.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
  },
];

const SESSION_KEY = 'first_session_guide_step';
const DONE_KEY = 'first_session_done';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface FirstSessionGuideProps {
  onComplete: () => void;
}

const FirstSessionGuide = ({ onComplete }: FirstSessionGuideProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { recordStep } = useOnboardingProgress();
  const sidebarContext = useSidebarSafe();

  const savedStep = parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
  const [currentStep, setCurrentStep] = useState(savedStep);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const rafRef = useRef<number>();

  const step = STEPS[currentStep];
  const isFullscreen = step?.targetSelector === 'fullscreen';
  const isLastStep = currentStep === STEPS.length - 1;

  // Persist step to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, String(currentStep));
  }, [currentStep]);

  // Find and track the highlighted element
  const updateSpotlight = useCallback(() => {
    if (!step || isFullscreen) {
      setSpotlight(null);
      setTooltipStyle({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const el = document.querySelector(step.targetSelector);
    if (!el) {
      // Element not found yet — retry
      rafRef.current = requestAnimationFrame(updateSpotlight);
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 8;
    const sr: SpotlightRect = {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    setSpotlight(sr);

    // Position tooltip
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - (sr.top + sr.height);
    const spaceAbove = sr.top;
    const tooltipMaxW = Math.min(340, window.innerWidth - 32);

    if (spaceBelow > 180) {
      setTooltipStyle({
        top: sr.top + sr.height + 16,
        left: Math.max(16, Math.min(sr.left, window.innerWidth - tooltipMaxW - 16)),
        maxWidth: tooltipMaxW,
      });
    } else if (spaceAbove > 180) {
      setTooltipStyle({
        bottom: viewportH - sr.top + 16,
        left: Math.max(16, Math.min(sr.left, window.innerWidth - tooltipMaxW - 16)),
        maxWidth: tooltipMaxW,
      });
    } else {
      setTooltipStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: tooltipMaxW,
      });
    }
  }, [step, isFullscreen]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateSpotlight]);

  // Handle sidebar open/close for specific steps
  useEffect(() => {
    if (step?.openSidebar && sidebarContext) {
      sidebarContext.setOpen(true);
      // Wait for sidebar to animate open, then re-measure
      setTimeout(updateSpotlight, 400);
    }
    if (step?.closeSidebar && sidebarContext) {
      sidebarContext.setOpen(false);
      setTimeout(updateSpotlight, 400);
    }
  }, [currentStep]);

  // Handle page transitions
  useEffect(() => {
    if (!step) return;
    const currentPage = location.pathname;
    if (step.page === 'home' && currentPage !== '/executive-home') {
      navigate('/executive-home');
    }
  }, [currentStep, step, location.pathname, navigate]);

  const handleNext = () => {
    if (isLastStep) {
      finish();
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const finish = () => {
    sessionStorage.setItem(DONE_KEY, '1');
    sessionStorage.removeItem(SESSION_KEY);
    if (sidebarContext) sidebarContext.setOpen(false);
    recordStep('first_session_walkthrough');
    onComplete();
    navigate('/daily-check-in');
  };

  if (!step) return null;

  // Build clip-path to create the spotlight cutout
  const clipPath = spotlight
    ? `polygon(
        0% 0%, 0% 100%, 
        ${spotlight.left}px 100%, 
        ${spotlight.left}px ${spotlight.top}px, 
        ${spotlight.left + spotlight.width}px ${spotlight.top}px, 
        ${spotlight.left + spotlight.width}px ${spotlight.top + spotlight.height}px, 
        ${spotlight.left}px ${spotlight.top + spotlight.height}px, 
        ${spotlight.left}px 100%, 
        100% 100%, 100% 0%
      )`
    : undefined;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* Dark overlay with optional spotlight cutout */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-all duration-300"
        style={spotlight ? { clipPath } : undefined}
      />

      {/* Spotlight border ring (only when highlighting an element) */}
      {spotlight && (
        <div
          className="absolute rounded-xl border-2 border-saffron/60 shadow-[0_0_24px_rgba(255,183,77,0.25)] pointer-events-none transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* Skip button */}
      <button
        onClick={finish}
        className="absolute top-4 right-4 z-[70] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        Skip
        <X size={14} />
      </button>

      {/* Tooltip Card */}
      <div
        className={cn(
          "absolute z-[70] bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl",
          "animate-in fade-in slide-in-from-bottom-2 duration-300",
          isFullscreen && "w-[calc(100%-32px)] max-w-[360px]"
        )}
        style={tooltipStyle}
      >
        {/* Phase label */}
        <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-saffron mb-2">
          {step.phaseLabel}
        </p>

        <h2 className="text-lg font-headline text-foreground leading-tight mb-2">
          {step.title}
        </h2>

        <p className="text-sm text-muted-foreground font-body leading-relaxed mb-5">
          {step.body}
        </p>

        {/* Footer: dots + action */}
        <div className="flex items-center justify-between">
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentStep
                    ? "w-5 bg-saffron"
                    : idx < currentStep
                    ? "w-1.5 bg-saffron/40"
                    : "w-1.5 bg-muted-foreground/25"
                )}
              />
            ))}
          </div>

          {/* Action button */}
          {isLastStep ? (
            <button
              onClick={finish}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20"
            >
              <Rocket size={16} />
              Begin
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-foreground font-medium text-sm border border-white/10 transition-colors"
            >
              Next
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Safely access sidebar context — returns null if not within a SidebarProvider.
 */
function useSidebarSafe() {
  try {
    return useSidebar();
  } catch {
    return null;
  }
}

export default FirstSessionGuide;
