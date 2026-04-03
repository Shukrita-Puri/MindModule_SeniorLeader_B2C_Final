/**
 * First Session Spotlight Walkthrough
 *
 * A 10-step guided demo that highlights real UI elements on the actual pages.
 * Phase A (steps 0-4): Core daily loop – starts on /daily-check-in, moves to /executive-home
 * Phase B (steps 5-9): Navigation features – all on /executive-home
 *
 * Key behaviours:
 * - Two-pass tooltip: hidden mount → measure height → compute position → reveal.
 * - Mobile sidebar uses setOpenMobile; desktop uses setOpen.
 * - Demo steps programmatically open sidebar, navigate to profile, etc.
 * - SVG mask spotlight with circular or rounded-rect shapes.
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
  page: 'check-in' | 'home' | 'profile';
  phase: 'A' | 'B';
  phaseLabel: string;
  scrollToTop?: boolean;
  scrollBlock?: ScrollLogicalPosition;
  spotlightPad?: number;
  spotlightCircle?: boolean;
  tooltipPosition?: 'above' | 'below' | 'auto';
  /** Actions to run before highlighting */
  action?: 'open-sidebar' | 'close-sidebar' | 'navigate-profile';
  /** Elevate sidebar panel above overlay */
  elevateSidebar?: boolean;
  /** Activate a tab before highlighting (clicks data-tour="tab-{value}") */
  activateTab?: 'state' | 'compass' | 'action';
}

const STEPS: GuideStep[] = [
  // ── Phase A – Daily Loop ──────────────────────────────────────
  {
    targetSelector: '[data-tour="check-in-carousel"]',
    title: 'Performance Readiness Assessment',
    body: "One tap to tell the system how you're performing right now – your sharpness, clarity, and confidence. This is where every day starts.",
    page: 'check-in',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="today-state"]',
    title: 'Your State – Decision Readiness Score',
    body: 'Your Decision Readiness is where your internal signals meet. It combines how you feel right now – your sharpness, clarity, and confidence, with an understanding from your wearable (if available) – based on your time of day.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    tooltipPosition: 'below',
    activateTab: 'state',
  },
  {
    targetSelector: '[data-tour="compass"]',
    title: 'Your Compass – Outer Readiness Brief',
    body: 'Your calendar, energy, and patterns shape a strategic read on your day. What to lean on. What to watch for.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'above',
    activateTab: 'compass',
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Your Action – Performance Readiness Plan',
    body: 'Practices and sessions built for today – designed to close the gap between where you are and where the day needs you to be.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'above',
    activateTab: 'action',
  },
  {
    targetSelector: 'fullscreen',
    title: 'The System Learns',
    body: 'Every practice you complete feeds back. Over time, it learns what works for you and adapts.',
    page: 'home',
    phase: 'A',
    phaseLabel: 'YOUR DAILY LOOP',
  },

  // ── Phase B – Navigation ──────────────────────────────────────
  {
    // Step 5 – Menu button
    targetSelector: '[data-tour="sidebar-trigger-wrap"]',
    title: 'Your Menu',
    body: 'Open this to access all your features – Assessment, Reset Studio, Coach, and Intelligence.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    scrollToTop: true,
    spotlightPad: 14,
    spotlightCircle: true,
    tooltipPosition: 'below',
  },
  {
    // Step 6 – Mental Performance Suite
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
    action: 'open-sidebar',
    elevateSidebar: true,
    tooltipPosition: 'below',
  },
  {
    // Step 7 – Connect Your Data (show profile entry in sidebar)
    targetSelector: '[data-tour="sidebar-profile-wrap"]',
    title: 'Connect Your Data',
    body: 'To sync Google Calendar and Apple Health, open the menu and tap your profile. From there, go to Connected Data Sources. This syncs automatically every 6 hours – the more context, the sharper your system.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    action: 'open-sidebar',
    elevateSidebar: true,
    spotlightPad: 14,
    spotlightCircle: true,
    tooltipPosition: 'above',
  },
  {
    // Step 8 – Coach button
    targetSelector: '[data-tour="coach-access-wrap"]',
    title: 'Mind Performance Coach',
    body: 'Instant AI-powered coaching – available from any screen. Built around your patterns and context.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    action: 'close-sidebar',
    scrollToTop: true,
    spotlightPad: 14,
    spotlightCircle: true,
    tooltipPosition: 'below',
  },
  {
    // Step 9 – Ready
    targetSelector: 'fullscreen',
    title: "You're Ready",
    body: 'Start with your first check-in.',
    page: 'home',
    phase: 'B',
    phaseLabel: 'YOUR NAVIGATION',
    action: 'close-sidebar',
  },
];

const SESSION_KEY = 'first_session_guide_step';
const ACTIVE_TOUR_KEY = 'first_session_guide_active';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface FirstSessionGuideProps {
  onComplete: () => void;
}

const FirstSessionGuide = ({ onComplete }: FirstSessionGuideProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarCtx = useSidebarSafe();

  const savedStep = parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
  // Show intro overlay only when tour starts from step 0 and hasn't been dismissed yet
  const [showIntro, setShowIntro] = useState(() => savedStep === 0 && !sessionStorage.getItem('first_session_intro_seen'));
  const [currentStep, setCurrentStep] = useState(savedStep);
  const [ready, setReady] = useState(false); // two-pass: only true when position is final

  const [spotRect, setSpotRect] = useState<{ x: number; y: number; w: number; h: number; r: number } | null>(null);
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

  /* ---- helpers ---- */

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
    // Reset mobile sheet dialog + overlay z-indexes
    const sheetDialog = document.querySelector('[data-sidebar="sidebar"]')?.closest('[role="dialog"]') as HTMLElement | null;
    if (sheetDialog) sheetDialog.style.zIndex = '';
    const sheetOverlayEl = sheetDialog?.previousElementSibling as HTMLElement | null;
    if (sheetOverlayEl) sheetOverlayEl.style.zIndex = '';
    setSpotRect(null);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (measureFrameRef.current) { cancelAnimationFrame(measureFrameRef.current); measureFrameRef.current = null; }
  }, []);

  const isElementVisible = useCallback((el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }, []);

  /** Open/close sidebar respecting mobile vs desktop */
  const setSidebar = useCallback((open: boolean) => {
    if (!sidebarCtx) return;
    if (sidebarCtx.isMobile) {
      sidebarCtx.setOpenMobile(open);
    } else {
      sidebarCtx.setOpen(open);
    }
  }, [sidebarCtx]);

  /* ---- measure & position (two-pass) ---- */

  const computePosition = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setSpotRect(null);
      setTooltipPos(null);
      return true; // ready
    }

    const el = document.querySelector(s.targetSelector) as HTMLElement | null;
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const pad = s.spotlightPad || 0;

    const sx = rect.left - pad;
    const sy = rect.top - pad;
    const sw = rect.width + pad * 2;
    const sh = rect.height + pad * 2;
    const sr = s.spotlightCircle ? Math.max(sw, sh) / 2 : 12;

    setSpotRect({ x: sx, y: sy, w: sw, h: sh, r: sr });

    // Measure tooltip height (hidden-rendered)
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
    } else if (spaceBelow >= spaceAbove && spaceBelow >= tooltipH + GAP) {
      top = sy + sh + GAP;
    } else if (spaceAbove >= tooltipH + GAP) {
      top = sy - tooltipH - GAP;
    } else {
      top = sy + sh + GAP;
    }

    top = Math.max(8, Math.min(top, vH - tooltipH - 8));
    setTooltipPos({ top });
    return true;
  }, []);

  /* ---- highlight lifecycle ---- */

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 20; // 20 × 250ms = 5 seconds max wait

  const highlightElement = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setSpotRect(null);
      setTooltipPos(null);
      setReady(true);
      retryCountRef.current = 0;
      return;
    }

    const el = document.querySelector(s.targetSelector);
    if (!isElementVisible(el)) {
      retryCountRef.current++;
      if (retryCountRef.current >= MAX_RETRIES) {
        // Graceful skip: target never appeared, advance to next step
        console.warn(`[FirstSessionGuide] Target "${s.targetSelector}" not found after ${MAX_RETRIES} retries – skipping step ${idx}`);
        retryCountRef.current = 0;
        setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
        return;
      }
      retryTimerRef.current = setTimeout(highlightElement, 250);
      return;
    }

    retryCountRef.current = 0;

    if (s.scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });

    const scrollBlock = s.scrollBlock || 'center';
    el.scrollIntoView({ behavior: 'smooth', block: scrollBlock });

    // Wait for scroll + sidebar animation to settle
    setTimeout(() => {
      if (currentStepRef.current !== idx) return;

      cleanupPrevious();

      el.style.position = 'relative';
      el.style.zIndex = '61';
      el.style.borderRadius = s.spotlightCircle ? '9999px' : '12px';
      previousElRef.current = el;

      if (s.elevateSidebar) {
        const sp = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement | null;
        if (sp) sp.style.zIndex = '61';
        const sheetDialog = document.querySelector('[data-sidebar="sidebar"]')?.closest('[role="dialog"]') as HTMLElement | null;
        if (sheetDialog) {
          sheetDialog.style.zIndex = '61';
          const sheetOverlayEl = sheetDialog.previousElementSibling as HTMLElement | null;
          if (sheetOverlayEl) sheetOverlayEl.style.zIndex = '61';
        }
      }

      computePosition();
      requestAnimationFrame(() => {
        computePosition();
        setReady(true);
      });
    }, 500);
  }, [cleanupPrevious, computePosition]);

  /* ---- run actions before highlighting ---- */

  /**
   * Polls for DOM target availability after an action (e.g. opening sidebar).
   * Calls cb() once the step's target selector is found or after maxWait ms.
   */
  const waitForTargetThenCb = useCallback((selector: string, cb: () => void, maxWait = 4000) => {
    const start = Date.now();
    const poll = () => {
      const el = document.querySelector(selector);
      if (isElementVisible(el)) {
        // Small settle delay after element appears
        setTimeout(cb, 150);
        return;
      }
      if (Date.now() - start > maxWait) {
        // Target never appeared – proceed anyway (highlightElement will retry/skip)
        cb();
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  }, [isElementVisible]);

  const waitForSidebarReady = useCallback((cb: () => void, selector?: string) => {
    const start = Date.now();
    const poll = () => {
      const sidebarEl = document.querySelector('[data-sidebar="sidebar"]');
      const targetEl = selector ? document.querySelector(selector) : null;
      const sidebarReady = sidebarCtx?.isMobile
        ? isElementVisible(sidebarEl)
        : sidebarCtx?.state === 'expanded';
      const targetReady = selector ? isElementVisible(targetEl) : true;

      if (sidebarReady && targetReady) {
        setTimeout(cb, 150);
        return;
      }

      if (Date.now() - start > 4000) {
        cb();
        return;
      }

      setTimeout(poll, 100);
    };
    poll();
  }, [isElementVisible, sidebarCtx]);

  const waitForSidebarClosed = useCallback((cb: () => void, selector?: string) => {
    const start = Date.now();
    const poll = () => {
      const sidebarEl = document.querySelector('[data-sidebar="sidebar"]');
      const targetEl = selector ? document.querySelector(selector) : null;
      const sidebarClosed = sidebarCtx?.isMobile
        ? !isElementVisible(sidebarEl)
        : sidebarCtx?.state === 'collapsed';
      const targetReady = selector ? isElementVisible(targetEl) : true;

      if (sidebarClosed && targetReady) {
        setTimeout(cb, 150);
        return;
      }

      if (Date.now() - start > 4000) {
        cb();
        return;
      }

      setTimeout(poll, 100);
    };
    poll();
  }, [isElementVisible, sidebarCtx]);

  const runStepAction = useCallback((s: GuideStep, cb: () => void) => {
    if (s.activateTab) {
      const tabBtn = document.querySelector(`[data-tour="tab-${s.activateTab}"]`) as HTMLElement | null;
      if (tabBtn) tabBtn.click();
    }

    if (!s.action) { cb(); return; }

    switch (s.action) {
      case 'open-sidebar':
        setSidebar(true);
        waitForSidebarReady(() => waitForTargetThenCb(s.targetSelector, cb), s.targetSelector);
        break;
      case 'close-sidebar':
        setSidebar(false);
        waitForSidebarClosed(() => waitForTargetThenCb(s.targetSelector, cb), s.targetSelector);
        break;
      case 'navigate-profile':
        setSidebar(false);
        setTimeout(() => {
          navigate('/profile');
          waitForTargetThenCb(s.targetSelector, cb);
        }, 400);
        break;
      default:
        cb();
    }
  }, [setSidebar, navigate, waitForTargetThenCb]);

  /* ---- step lifecycle ---- */

  useEffect(() => {
    clearRetry();
    cleanupPrevious();
    setReady(false);
    setTooltipPos(null);
    setSpotRect(null);

    const s = STEPS[currentStep];
    if (!s) return;

    // Navigate to correct page first
    const cur = location.pathname;
    if (s.page === 'home' && cur !== '/executive-home') {
      navigate('/executive-home');
    } else if (s.page === 'check-in' && cur !== '/daily-check-in') {
      navigate('/daily-check-in');
    } else if (s.page === 'profile' && cur !== '/profile') {
      navigate('/profile');
    }

    // Run action then highlight, with delay for page transitions
    const startDelay = cur !== getPagePath(s.page) ? 800 : 150;
    const timer = setTimeout(() => {
      runStepAction(s, highlightElement);
    }, startDelay);

    return () => {
      clearTimeout(timer);
      clearRetry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPrevious();
      clearRetry();
      setSidebar(false);
    };
  }, [cleanupPrevious, clearRetry, setSidebar]);

  // Re-measure on scroll/resize (only when ready)
  useEffect(() => {
    if (!ready) return;
    const handler = () => {
      if (measureFrameRef.current) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = requestAnimationFrame(() => computePosition());
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [ready, computePosition]);

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
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ACTIVE_TOUR_KEY);
    setSidebar(false);
    onComplete();
    navigate('/daily-check-in');
  };

  const dismissIntroAndStart = () => {
    sessionStorage.setItem('first_session_intro_seen', '1');
    setShowIntro(false);
  };

  const skipTourEntirely = () => {
    sessionStorage.setItem('first_session_intro_seen', '1');
    setShowIntro(false);
    finish();
  };

  if (!step) return null;

  /* ---- Intro overlay (before tour begins) ---- */
  if (showIntro) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
        {/* Dark backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Centred card */}
        <div className="relative z-10 bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-8 shadow-2xl mx-4 max-w-sm w-full text-center">
          <h2 className="text-2xl font-headline text-foreground leading-tight mb-3">
            Let's show you around.
          </h2>
          <p className="text-sm text-muted-foreground font-body leading-relaxed mb-8">
            A 60-second guided tour of how Mind Module works — starting with your daily check-in.
            Follow the steps and you'll know exactly what to do from day one.
          </p>

          <button
            onClick={dismissIntroAndStart}
            className="w-full py-3.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20 mb-3"
          >
            Start Tour
          </button>

          <button
            onClick={skipTourEntirely}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Skip tour
          </button>
        </div>
      </div>
    );
  }

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
      {spotRect && ready && (
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

      {/* Block interactions outside the spotlight while leaving the highlighted area usable */}
      {spotRect ? (
        <>
          <div
            className="absolute left-0 right-0 top-0"
            style={{ height: Math.max(spotRect.y, 0), pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute left-0"
            style={{
              top: Math.max(spotRect.y, 0),
              width: Math.max(spotRect.x, 0),
              height: Math.max(spotRect.h, 0),
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute right-0"
            style={{
              top: Math.max(spotRect.y, 0),
              width: Math.max(window.innerWidth - (spotRect.x + spotRect.w), 0),
              height: Math.max(spotRect.h, 0),
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute left-0 right-0 bottom-0"
            style={{ top: Math.max(spotRect.y + spotRect.h, 0), pointerEvents: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      ) : (
        <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
      )}

      {/* Skip */}
      <button
        onClick={finish}
        className="absolute right-4 z-[70] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', pointerEvents: 'auto' }}
      >
        Skip <X size={14} />
      </button>

      {/* Tooltip Card – hidden until ready for two-pass measurement */}
      <div
        ref={tooltipRef}
        className={cn(
          'fixed z-[70] bg-card/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl mx-auto',
          ready ? 'opacity-100 transition-opacity duration-300' : 'opacity-0 pointer-events-none',
        )}
        style={{ ...tooltipStyle, maxWidth: tooltipMaxW, pointerEvents: ready ? 'auto' : 'none' }}
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
              <button onClick={handleBack} className="flex items-center gap-1 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground text-sm transition-colors" style={{ pointerEvents: 'auto' }}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {isLastStep ? (
              <button onClick={finish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20" style={{ pointerEvents: 'auto' }}>
                <Rocket size={16} /> Begin
              </button>
            ) : (
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-foreground font-medium text-sm border border-white/10 transition-colors" style={{ pointerEvents: 'auto' }}>
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function getPagePath(page: string): string {
  switch (page) {
    case 'home': return '/executive-home';
    case 'check-in': return '/daily-check-in';
    case 'profile': return '/profile';
    default: return '/';
  }
}

function useSidebarSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSidebar();
  } catch {
    return null;
  }
}

export default FirstSessionGuide;
