/**
 * First Session Spotlight Walkthrough
 *
 * A 10-step guided demo that highlights real UI elements on the actual pages.
 * Phase A (steps 0-4): Core daily loop — starts on /daily-check-in, moves to /executive-home
 * Phase B (steps 5-9): Navigation features — all on /executive-home
 *
 * Key behaviours:
 * - Tooltip is positioned via measured rects so it never covers the target.
 * - "Demo" steps programmatically open the sidebar, scroll to items, etc.
 * - Sidebar panel is elevated above the overlay when needed.
 * - Small icon buttons (Menu / Coach) get a larger circular spotlight.
 * - SVG cut-out overlay creates a true spotlight effect.
 */

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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
  openSidebar?: boolean;
  closeSidebar?: boolean;
  scrollToTop?: boolean;
  scrollBlock?: ScrollLogicalPosition;
  /** Extra padding (px) around the spotlight rectangle. */
  spotlightPad?: number;
  /** Elevate sidebar panel above overlay for this step */
  elevateSidebar?: boolean;
  /** Use circular spotlight shape */
  spotlightCircle?: boolean;
  /** Preferred tooltip position. 'auto' (default) measures best fit. */
  tooltipPosition?: 'above' | 'below' | 'auto';
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
    tooltipPosition: 'below',
  },
  {
    targetSelector: '[data-tour="compass"]',
    title: 'Your Compass — Outer Readiness Brief',
    body: 'Your calendar, energy, and patterns shape a strategic read on your day. What to lean on. What to watch for.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'above',
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Your Action — Performance Readiness Plan',
    body: 'Practices and sessions built for today — designed to close the gap between where you are and where the day needs you to be.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'above',
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
    // Step 5 — Menu button
    targetSelector: '[data-tour="sidebar-trigger-wrap"]',
    title: 'Your Menu',
    body: 'Open this to access all your features — Assessment, Reset Studio, Coach, and Intelligence.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    scrollToTop: true,
    spotlightPad: 14,
    spotlightCircle: true,
    tooltipPosition: 'below',
  },
  {
    // Step 6 — Mental Performance Suite
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
    tooltipPosition: 'below',
  },
  {
    // Step 7 — Coach button
    targetSelector: '[data-tour="coach-access-wrap"]',
    title: 'Mind Performance Coach',
    body: 'Instant AI-powered coaching — available from any screen. Built around your patterns and context.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    closeSidebar: true,
    scrollToTop: true,
    spotlightPad: 14,
    spotlightCircle: true,
    tooltipPosition: 'below',
  },
  {
    // Step 8 — Connect Your Data
    targetSelector: '[data-tour="sidebar-profile"]',
    title: 'Connect Your Data',
    body: 'To sync Google Calendar and Apple Health, open the menu and tap your profile. From there, go to Connected Data Sources. This syncs automatically every 6 hours — the more context, the sharper your system.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    openSidebar: true,
    elevateSidebar: true,
    tooltipPosition: 'above',
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
  const [tooltipVisible, setTooltipVisible] = useState(false);

  // Spotlight rect (viewport coords) for the SVG cut-out
  const [spotRect, setSpotRect] = useState<{ x: number; y: number; w: number; h: number; r: number } | null>(null);
  // Tooltip position
  const [tooltipPos, setTooltipPos] = useState<{ top: number } | null>(null);

  const previousElRef = useRef<HTMLElement | null>(null);
  const currentStepRef = useRef(currentStep);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const measureFrameRef = useRef<number | null>(null);

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
    const sp = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null;
    if (sp) sp.style.zIndex = '';
    setSpotRect(null);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (measureFrameRef.current) {
      cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = null;
    }
  }, []);

  /* ---- measure & position ---- */

  const measureAndPosition = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }

    const el = document.querySelector(s.targetSelector) as HTMLElement | null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = s.spotlightPad || 0;

    // Spotlight rect with padding
    const sx = rect.left - pad;
    const sy = rect.top - pad;
    const sw = rect.width + pad * 2;
    const sh = rect.height + pad * 2;
    const sr = s.spotlightCircle ? Math.max(sw, sh) / 2 : 12;

    setSpotRect({ x: sx, y: sy, w: sw, h: sh, r: sr });

    // Measure tooltip height
    const tooltipEl = tooltipRef.current;
    const tooltipH = tooltipEl ? tooltipEl.offsetHeight : 220;
    const GAP = 16;
    const vH = window.innerHeight;

    const spaceAbove = sy;
    const spaceBelow = vH - (sy + sh);

    const pref = s.tooltipPosition || 'auto';

    let top: number;
    if (pref === 'above' && spaceAbove >= tooltipH + GAP) {
      top = sy - tooltipH - GAP;
    } else if (pref === 'below' && spaceBelow >= tooltipH + GAP) {
      top = sy + sh + GAP;
    } else if (pref === 'auto' || (pref === 'above' && spaceAbove < tooltipH + GAP) || (pref === 'below' && spaceBelow < tooltipH + GAP)) {
      // Auto: prefer whichever side has more room
      if (spaceBelow >= spaceAbove && spaceBelow >= tooltipH + GAP) {
        top = sy + sh + GAP;
      } else if (spaceAbove >= tooltipH + GAP) {
        top = sy - tooltipH - GAP;
      } else {
        // Clamp below if neither fits
        top = sy + sh + GAP;
      }
    } else {
      top = sy + sh + GAP;
    }

    // Clamp within viewport
    top = Math.max(8, Math.min(top, vH - tooltipH - 8));

    setTooltipPos({ top });
  }, []);

  /* ---- highlight + measure ---- */

  const highlightElement = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setSpotRect(null);
      setTooltipPos(null);
      setTooltipVisible(true);
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
      el.style.position = 'relative';
      el.style.zIndex = '61';
      if (s.spotlightCircle) {
        el.style.borderRadius = '9999px';
      } else {
        el.style.borderRadius = '12px';
      }
      previousElRef.current = el;

      // Sidebar elevation
      if (s.elevateSidebar) {
        const sp = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null;
        if (sp) sp.style.zIndex = '61';
      }

      // Measure positions
      measureAndPosition();
      setTooltipVisible(true);

      // Re-measure after a short delay for any layout shifts
      setTimeout(measureAndPosition, 100);
    }, 500);
  }, [cleanupPrevious, measureAndPosition]);

  /* ---- step lifecycle ---- */

  useEffect(() => {
    clearRetry();
    cleanupPrevious();
    setTooltipVisible(false);
    setTooltipPos(null);
    setSpotRect(null);

    const hlTimer = setTimeout(highlightElement, 150);

    return () => {
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

  // Re-measure on scroll/resize
  useEffect(() => {
    const handler = () => {
      if (measureFrameRef.current) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = requestAnimationFrame(measureAndPosition);
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [measureAndPosition]);

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
    onComplete();
    navigate('/daily-check-in');
  };

  if (!step) return null;

  /* ---- tooltip position styles ---- */

  const tooltipStyle: React.CSSProperties =
    isFullscreen || tooltipPos === null
      ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)' }
      : { top: `${tooltipPos.top}px`, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)' };

  const tooltipMaxW = isFullscreen ? '360px' : '400px';

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* SVG overlay with spotlight cut-out */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotRect && (
              <rect
                x={spotRect.x}
                y={spotRect.y}
                width={spotRect.w}
                height={spotRect.h}
                rx={spotRect.r}
                ry={spotRect.r}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.45)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight glow ring */}
      {spotRect && (
        <div
          className="absolute pointer-events-none border-2 border-saffron/30 transition-all duration-500"
          style={{
            left: spotRect.x - 2,
            top: spotRect.y - 2,
            width: spotRect.w + 4,
            height: spotRect.h + 4,
            borderRadius: spotRect.r >= 9999 ? '9999px' : `${spotRect.r + 2}px`,
            boxShadow: '0 0 30px rgba(255,183,77,0.15)',
          }}
        />
      )}

      {/* Click-through overlay to block interactions outside spotlight */}
      <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />

      {/* Skip */}
      <button
        onClick={finish}
        className="absolute right-4 z-[70] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', pointerEvents: 'auto' }}
      >
        Skip <X size={14} />
      </button>

      {/* Tooltip Card */}
      <div
        ref={tooltipRef}
        className={cn(
          'fixed z-[70] bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl transition-all duration-300 mx-auto',
          tooltipVisible ? 'opacity-100' : 'opacity-0 translate-y-2',
        )}
        style={{ ...tooltipStyle, maxWidth: tooltipMaxW, pointerEvents: 'auto' }}
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
