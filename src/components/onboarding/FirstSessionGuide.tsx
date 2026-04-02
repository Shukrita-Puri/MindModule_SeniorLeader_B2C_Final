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
import { X, ArrowRight, ArrowLeft, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GuideStep {
  targetSelector: string;
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
    body: 'One tap to tell the system how you\'re performing right now — your sharpness, clarity, and confidence. This is where every day starts.',
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
  const [tooltipVisible, setTooltipVisible] = useState(true);
  const previousElRef = useRef<HTMLElement | null>(null);

  const step = STEPS[currentStep];
  const isFullscreen = step?.targetSelector === 'fullscreen';
  const isLastStep = currentStep === STEPS.length - 1;

  // Persist step
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, String(currentStep));
  }, [currentStep]);

  // Clean up previously highlighted element
  const cleanupPrevious = useCallback(() => {
    if (previousElRef.current) {
      previousElRef.current.style.position = '';
      previousElRef.current.style.zIndex = '';
      previousElRef.current.style.boxShadow = '';
      previousElRef.current.style.borderRadius = '';
      previousElRef.current = null;
    }
  }, []);

  // Highlight and scroll to the target element
  const highlightElement = useCallback(() => {
    cleanupPrevious();

    if (!step || isFullscreen) return;

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (!el) {
      // Retry until element appears
      const timer = setTimeout(highlightElement, 200);
      return () => clearTimeout(timer);
    }

    // Scroll element into center
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // After scroll settles, raise element above overlay
    setTimeout(() => {
      el.style.position = 'relative';
      el.style.zIndex = '61';
      el.style.boxShadow = '0 0 40px rgba(255,183,77,0.15)';
      el.style.borderRadius = '12px';
      previousElRef.current = el;
    }, 450);
  }, [step, isFullscreen, cleanupPrevious]);

  useEffect(() => {
    setTooltipVisible(false);
    const fadeTimer = setTimeout(() => setTooltipVisible(true), 500);

    highlightElement();

    return () => {
      clearTimeout(fadeTimer);
    };
  }, [currentStep, highlightElement]);

  // Handle sidebar open/close
  useEffect(() => {
    if (step?.openSidebar && sidebarContext) {
      sidebarContext.setOpen(true);
      setTimeout(highlightElement, 400);
    }
    if (step?.closeSidebar && sidebarContext) {
      sidebarContext.setOpen(false);
      setTimeout(highlightElement, 400);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupPrevious();
  }, [cleanupPrevious]);

  const handleNext = () => {
    if (isLastStep) {
      finish();
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const finish = () => {
    cleanupPrevious();
    sessionStorage.setItem(DONE_KEY, '1');
    sessionStorage.removeItem(SESSION_KEY);
    if (sidebarContext) sidebarContext.setOpen(false);
    recordStep('first_session_walkthrough');
    onComplete();
    navigate('/daily-check-in');
  };

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* Light overlay — no clip-path, no blur */}
      <div className="absolute inset-0 bg-black/40 transition-opacity duration-300" />

      {/* Skip button */}
      <button
        onClick={finish}
        className="absolute top-4 right-4 z-[70] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        Skip
        <X size={14} />
      </button>

      {/* Tooltip Card — fixed to bottom for non-fullscreen, centered for fullscreen */}
      <div
        className={cn(
          "z-[70] bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl transition-all duration-300",
          tooltipVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          isFullscreen
            ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-[360px]"
            : "fixed bottom-6 left-4 right-4 max-w-[400px] mx-auto"
        )}
      >
        {/* Phase label + step counter */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-saffron">
            {step.phaseLabel}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">
            {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        <h2 className="text-lg font-headline text-foreground leading-tight mb-2">
          {step.title}
        </h2>

        <p className="text-sm text-muted-foreground font-body leading-relaxed mb-5">
          {step.body}
        </p>

        {/* Footer: dots + actions */}
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

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}

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
