/**
 * First Session Spotlight Walkthrough
 *
 * A 10-step guided demo that highlights real UI elements on the actual pages.
 * Phase A (steps 0-4): Core daily loop — starts on /daily-check-in, moves to /executive-home
 * Phase B (steps 5-9): Navigation features — all on /executive-home
 *
 * Key behaviours:
 * - Tooltip is always positioned with a measured gap so it never covers the
 *   highlighted element.
 * - "Demo" steps programmatically open the sidebar, scroll to items, etc.
 * - Sidebar panel is elevated above the overlay when needed.
 * - Small icon buttons (Menu / Coach) get a larger circular spotlight.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSidebar } from '@/components/ui/sidebar';
import { X, ArrowRight, ArrowLeft, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

interface GuideStep {
  targetSelector: string;
  title: string;
  body: string;
  richBody?: React.ReactNode;
  page: 'check-in' | 'home';
  phase: 'A' | 'B';
  phaseLabel: string;
  /** Open sidebar before highlighting */
  openSidebar?: boolean;
  /** Close sidebar before highlighting */
  closeSidebar?: boolean;
  /** Scroll window to top before highlighting */
  scrollToTop?: boolean;
  /** ScrollIntoView block alignment. Default 'center'. */
  scrollBlock?: ScrollLogicalPosition;
  /** Extra padding (px) around the spotlight rectangle. */
  spotlightPad?: number;
  /** Elevate sidebar panel above overlay for this step */
  elevateSidebar?: boolean;
}

const STEPS: GuideStep[] = [
  // ── Phase A — Daily Loop ──────────────────────────────────────
  {
    targetSelector: '[data-tour="check-in-carousel"]',
    title: 'Performance Readiness Assessment',
    body: "One tap to tell the system how you're performing right now — your sharpness, clarity, and confidence. This is where every day starts.",
    page: 'check-in',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="today-state"]',
    title: 'Your State — Decision Readiness Score',
    body: 'Your Decision Readiness is where your internal signals meet. It combines how you feel right now — your sharpness, clarity, and confidence, with an understanding from your wearable (if available) — based on your time of day.',
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
    scrollBlock: 'start',
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Your Action — Performance Readiness Plan',
    body: 'Practices and sessions built for today — designed to close the gap between where you are and where the day needs you to be.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
  },
  {
    targetSelector: 'fullscreen',
    title: 'The System Learns',
    body: 'Every practice you complete feeds back. Over time, it learns what works for you and adapts.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },

  // ── Phase B — Navigation ──────────────────────────────────────
  {
    // Step 5 — Menu button (larger circle spotlight)
    targetSelector: '[data-tour="sidebar-trigger-wrap"]',
    title: 'Your Menu',
    body: 'Open this to access all your features — Assessment, Reset Studio, Coach, and Intelligence.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    scrollToTop: true,
    spotlightPad: 12,
  },
  {
    // Step 6 — Mental Performance Suite (sidebar open, elevated)
    targetSelector: '[data-tour="sidebar-nav"]',
    title: 'Your Mental Performance Suite',
    body: '',
    richBody: (
      <div className="space-y-2.5">
        <div>
          <span className="font-semibold text-foreground text-xs">Performance Readiness Assessment</span>
          <p className="text-xs text-muted-foreground">Check your mental state daily</p>
        </div>
        <div>
          <span className="font-semibold text-foreground text-xs">Reset Studio</span>
          <p className="text-xs text-muted-foreground">Guided practices to restore energy</p>
        </div>
        <div>
          <span className="font-semibold text-foreground text-xs">Mind Performance Coach</span>
          <p className="text-xs text-muted-foreground">AI coaching built around your patterns</p>
        </div>
        <div>
          <span className="font-semibold text-foreground text-xs">Performance Intelligence</span>
          <p className="text-xs text-muted-foreground">Track trends and growth over time</p>
        </div>
      </div>
    ),
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    openSidebar: true,
    elevateSidebar: true,
  },
  {
    // Step 7 — Coach button (larger circle spotlight)
    targetSelector: '[data-tour="coach-access-wrap"]',
    title: 'Mind Performance Coach',
    body: 'Instant AI-powered coaching — available from any screen. Built around your patterns and context.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    closeSidebar: true,
    scrollToTop: true,
    spotlightPad: 12,
  },
  {
    // Step 8 — Connect Your Data (sidebar > profile > connected data)
    // Demo-style: opens sidebar, highlights profile entry which leads to connected data
    targetSelector: '[data-tour="sidebar-profile"]',
    title: 'Connect Your Data',
    body: 'To sync Google Calendar and Apple Health, open the menu and tap your profile. From there, go to Connected Data Sources. This syncs automatically every 6 hours — the more context, the sharper your system.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    openSidebar: true,
    elevateSidebar: true,
  },
  {
    // Step 9 — Ready
    targetSelector: 'fullscreen',
    title: "You're Ready",
    body: 'Start with your first check-in.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    closeSidebar: true,
  },
];

const SESSION_KEY = 'first_session_guide_step';
const DONE_KEY = 'first_session_done';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface FirstSessionGuideProps {
  onComplete: () => void;
}

const FirstSessionGuide = ({ onComplete }: FirstSessionGuideProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarContext = useSidebarSafe();

  const savedStep = parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
  const [currentStep, setCurrentStep] = useState(savedStep);
  const [tooltipVisible, setTooltipVisible] = useState(true);
  /** Pixel position of the tooltip (top of tooltip card). null = centre (fullscreen). */
  const [tooltipTop, setTooltipTop] = useState<number | null>(null);
  const previousElRef = useRef<HTMLElement | null>(null);
  const currentStepRef = useRef(currentStep);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  currentStepRef.current = currentStep;

  const step = STEPS[currentStep];
  const isFullscreen = step?.targetSelector === 'fullscreen';
  const isLastStep = currentStep === STEPS.length - 1;

  // Persist step
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, String(currentStep));
  }, [currentStep]);

  /* ---- cleanup helpers ---- */

  const cleanupPrevious = useCallback(() => {
    if (previousElRef.current) {
      previousElRef.current.style.position = '';
      previousElRef.current.style.zIndex = '';
      previousElRef.current.style.boxShadow = '';
      previousElRef.current.style.borderRadius = '';
      previousElRef.current.style.padding = '';
      previousElRef.current.style.margin = '';
      previousElRef.current = null;
    }
    // Sidebar z-index
    const sp = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null;
    if (sp) sp.style.zIndex = '';
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /* ---- highlight + measure ---- */

  const highlightElement = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setTooltipTop(null); // centre
      return;
    }

    const el = document.querySelector(s.targetSelector) as HTMLElement | null;
    if (!el) {
      retryTimerRef.current = setTimeout(highlightElement, 250);
      return;
    }

    if (s.scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });

    const scrollBlock = s.scrollBlock || 'center';
    el.scrollIntoView({ behavior: 'smooth', block: scrollBlock });

    // Wait for scroll + sidebar animation to settle
    setTimeout(() => {
      if (currentStepRef.current !== idx) return;

      cleanupPrevious();

      // Raise element above overlay
      const pad = s.spotlightPad || 0;
      el.style.position = 'relative';
      el.style.zIndex = '61';
      el.style.boxShadow = '0 0 40px rgba(255,183,77,0.15)';
      // Circular spotlight for small icon buttons, rounded-rect for sections
      if (pad > 0) {
        el.style.borderRadius = '9999px';
        el.style.padding = `${pad}px`;
        el.style.margin = `-${pad}px`;
      } else {
        el.style.borderRadius = '12px';
      }
      previousElRef.current = el;

      // Sidebar elevation
      if (s.elevateSidebar) {
        const sp = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null;
        if (sp) sp.style.zIndex = '61';
      }

      // ── Measured tooltip positioning ──
      // Goal: place the tooltip card so it never overlaps the highlighted element.
      const rect = el.getBoundingClientRect();
      const vH = window.innerHeight;
      const TOOLTIP_H = 260; // estimated max height of tooltip card
      const GAP = 20;        // space between tooltip and element

      const spaceAbove = rect.top;
      const spaceBelow = vH - rect.bottom;

      if (spaceAbove >= TOOLTIP_H + GAP) {
        // Place above the element
        setTooltipTop(rect.top - TOOLTIP_H - GAP);
      } else if (spaceBelow >= TOOLTIP_H + GAP) {
        // Place below the element
        setTooltipTop(rect.bottom + GAP);
      } else {
        // Not enough room either side — clamp to safe zone
        // Prefer top, clamp at safe-area + 56px
        setTooltipTop(Math.max(60, rect.top - TOOLTIP_H - GAP));
      }
    }, 500);
  }, [cleanupPrevious]);

  /* ---- step lifecycle ---- */

  useEffect(() => {
    clearRetry();
    cleanupPrevious();
    setTooltipVisible(false);

    const fadeTimer = setTimeout(() => setTooltipVisible(true), 550);
    const hlTimer = setTimeout(highlightElement, 150);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hlTimer);
      clearRetry();
    };
  }, [currentStep, highlightElement, cleanupPrevious, clearRetry]);

  // Sidebar open/close
  useEffect(() => {
    if (!step) return;
    if (step.openSidebar && sidebarContext) {
      sidebarContext.setOpen(true);
      setTimeout(highlightElement, 600);
    }
    if (step.closeSidebar && sidebarContext) {
      sidebarContext.setOpen(false);
      setTimeout(highlightElement, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Page transitions
  useEffect(() => {
    if (!step) return;
    const cur = location.pathname;
    if (step.page === 'home' && cur !== '/executive-home') navigate('/executive-home');
    if (step.page === 'check-in' && cur !== '/daily-check-in') navigate('/daily-check-in');
  }, [currentStep, step, location.pathname, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupPrevious(); clearRetry(); };
  }, [cleanupPrevious, clearRetry]);

  /* ---- actions ---- */

  const handleNext = () => {
    if (isLastStep) { finish(); return; }
    cleanupPrevious();
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      cleanupPrevious();
      setCurrentStep(prev => prev - 1);
    }
  };

  const finish = () => {
    cleanupPrevious();
    clearRetry();
    sessionStorage.setItem(DONE_KEY, '1');
    sessionStorage.removeItem(SESSION_KEY);
    if (sidebarContext) sidebarContext.setOpen(false);
    // Don't submit invalid onboarding step — just mark done locally
    onComplete();
    navigate('/daily-check-in');
  };

  if (!step) return null;

  /* ---- tooltip position styles ---- */

  const tooltipStyle: React.CSSProperties =
    isFullscreen || tooltipTop === null
      ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)' }
      : { top: `${Math.max(8, tooltipTop)}px`, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)' };

  const tooltipMaxW = isFullscreen ? '360px' : '400px';

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 transition-opacity duration-300" />

      {/* Skip */}
      <button
        onClick={finish}
        className="absolute right-4 z-[70] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        Skip <X size={14} />
      </button>

      {/* Tooltip Card */}
      <div
        className={cn(
          'fixed z-[70] bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl transition-all duration-300 mx-auto',
          tooltipVisible ? 'opacity-100' : 'opacity-0 translate-y-2',
        )}
        style={{ ...tooltipStyle, maxWidth: tooltipMaxW, width: isFullscreen ? 'calc(100% - 32px)' : undefined }}
      >
        {/* Phase + counter */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-saffron">
            {step.phaseLabel}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">
            {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        <h2 className="text-lg font-headline text-foreground leading-tight mb-2">{step.title}</h2>

        {step.richBody ? (
          <div className="mb-4">{step.richBody}</div>
        ) : (
          <p className="text-sm text-muted-foreground font-body leading-relaxed mb-5">{step.body}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  idx === currentStep ? 'w-5 bg-saffron' : idx < currentStep ? 'w-1.5 bg-saffron/40' : 'w-1.5 bg-muted-foreground/25',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button onClick={handleBack} className="flex items-center gap-1 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground text-sm transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {isLastStep ? (
              <button onClick={finish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20">
                <Rocket size={16} /> Begin
              </button>
            ) : (
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-foreground font-medium text-sm border border-white/10 transition-colors">
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function useSidebarSafe() {
  try {
    return useSidebar();
  } catch {
    return null;
  }
}

export default FirstSessionGuide;
