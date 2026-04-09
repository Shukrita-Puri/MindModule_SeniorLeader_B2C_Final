/**
 * First Session Spotlight Walkthrough
 *
 * A 3-step guided demo that highlights real UI elements on the actual pages.
 * Step 1: Check-in carousel on /daily-check-in
 * Step 2: Today State card on /executive-home
 * Step 3: Daily Plan on /executive-home
 *
 * Key behaviours:
 * - Two-pass tooltip: hidden mount → measure height → compute position → reveal.
 * - SVG mask spotlight with circular or rounded-rect shapes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useSidebar } from '@/components/ui/sidebar';
import { X, ArrowRight, ArrowLeft, Rocket, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

interface GuideStep {
  targetSelector: string;
  title: string;
  body: string;
  page: 'check-in' | 'home';
  phaseLabel: string;
  scrollToTop?: boolean;
  scrollBlock?: ScrollLogicalPosition;
  spotlightPad?: number;
  spotlightCircle?: boolean;
  tooltipPosition?: 'above' | 'below' | 'auto';
  activateTab?: 'state' | 'compass' | 'action';
}

const STEPS: GuideStep[] = [
  {
    targetSelector: '[data-tour="check-in-carousel"]',
    title: 'Performance Readiness Assessment',
    body: "One tap. The system reads your sharpness, clarity, and confidence.",
    page: 'check-in',
    phaseLabel: 'YOUR DAILY LOOP',
  },
  {
    targetSelector: '[data-tour="today-state"]',
    title: 'Your Decision Engine',
    body: 'Internal signals, calendar pressure, and wearable data — triangulated into one readiness brief.',
    page: 'home',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'below',
    activateTab: 'state',
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Performance Mastery Plan',
    body: "Today's plan — built to close the gap between state and demand.",
    page: 'home',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'center',
    tooltipPosition: 'above',
    activateTab: 'action',
  },
];

const SESSION_KEY = 'first_session_guide_step';
const ACTIVE_TOUR_KEY = 'first_session_guide_active';
const ACTIVE_TOUR_USER_KEY = 'first_session_guide_user';
const RETAKE_TOUR_KEY = 'first_session_guide_retake';
const TARGET_WAIT_MS = 1800;
const RETRY_INTERVAL_MS = 150;
const MAX_RETRIES = 10;
const STEP_FAILSAFE_MS = 3500;

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
  const [showIntro, setShowIntro] = useState(() => savedStep === 0 && !sessionStorage.getItem('first_session_intro_seen'));
  const [currentStep, setCurrentStep] = useState(savedStep);
  const [ready, setReady] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);

  const [spotRect, setSpotRect] = useState<{ x: number; y: number; w: number; h: number; r: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number } | null>(null);

  const previousElRef = useRef<HTMLElement | null>(null);
  const currentStepRef = useRef(currentStep);
  const readyRef = useRef(ready);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const measureFrameRef = useRef<number | null>(null);

  currentStepRef.current = currentStep;
  readyRef.current = ready;

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
    setSpotRect(null);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (failsafeTimerRef.current) { clearTimeout(failsafeTimerRef.current); failsafeTimerRef.current = null; }
    if (measureFrameRef.current) { cancelAnimationFrame(measureFrameRef.current); measureFrameRef.current = null; }
  }, []);

  const enableFallback = useCallback((message?: string) => {
    cleanupPrevious();
    clearRetry();
    setSpotRect(null);
    setTooltipPos(null);
    setTransitionMessage(message || 'This step took longer than expected. You can continue the tour from here.');
    setFallbackMode(true);
    setReady(true);
  }, [cleanupPrevious, clearRetry]);

  const isElementVisible = useCallback((el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }, []);

  /** Close sidebar if open */
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
      return true;
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

    const tooltipEl = tooltipRef.current;
    const tooltipH = tooltipEl ? tooltipEl.offsetHeight : 220;
    const GAP = 16;
    const vH = window.innerHeight;
    // Reserve space for bottom safe area (nav hidden during tour, but keep margin)
    const BOTTOM_SAFE = 80;

    const spaceAbove = sy;
    const spaceBelow = vH - (sy + sh) - BOTTOM_SAFE;
    const pref = s.tooltipPosition || 'below';

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

    top = Math.max(8, Math.min(top, vH - tooltipH - BOTTOM_SAFE));
    setTooltipPos({ top });
    return true;
  }, []);

  /* ---- highlight lifecycle ---- */

  const retryCountRef = useRef(0);

  const highlightElement = useCallback(() => {
    const idx = currentStepRef.current;
    const s = STEPS[idx];
    if (!s || s.targetSelector === 'fullscreen') {
      setSpotRect(null);
      setTooltipPos(null);
      setFallbackMode(false);
      setReady(true);
      retryCountRef.current = 0;
      return;
    }

    const el = document.querySelector(s.targetSelector);
    if (!isElementVisible(el)) {
      retryCountRef.current++;
      if (retryCountRef.current >= MAX_RETRIES) {
        console.warn(`[FirstSessionGuide] Target "${s.targetSelector}" not found after ${MAX_RETRIES} retries – falling back`);
        retryCountRef.current = 0;
        enableFallback('We could not spotlight this area right now, but you can keep moving through the tour.');
        return;
      }
      retryTimerRef.current = setTimeout(highlightElement, RETRY_INTERVAL_MS);
      return;
    }

    retryCountRef.current = 0;

    if (s.scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });

    const scrollBlock = s.scrollBlock || 'center';
    el.scrollIntoView({ behavior: 'smooth', block: scrollBlock });

    setTimeout(() => {
      if (currentStepRef.current !== idx) return;

      cleanupPrevious();

      el.style.position = 'relative';
      el.style.zIndex = '61';
      el.style.borderRadius = s.spotlightCircle ? '9999px' : '12px';
      previousElRef.current = el;

      // Secondary scroll adjustment: ensure tooltip fits and feature is centered
      const pref = s.tooltipPosition || 'below';
      const tooltipH = tooltipRef.current?.offsetHeight || 220;
      const GAP = 16;
      const rect = el.getBoundingClientRect();
      const vH = window.innerHeight;

      if (pref === 'above') {
        // Ensure enough space above the feature for the tooltip
        const minTop = tooltipH + GAP + 60; // 60px top safe area
        if (rect.top < minTop) {
          window.scrollBy({ top: rect.top - minTop, behavior: 'smooth' });
        }
      } else if (pref === 'below') {
        // Ensure feature is in upper portion so tooltip fits below
        const maxFeatureTop = vH * 0.35;
        if (rect.top > maxFeatureTop) {
          window.scrollBy({ top: rect.top - maxFeatureTop, behavior: 'smooth' });
        }
      }

      // Allow secondary scroll to settle, then compute position
      setTimeout(() => {
        if (currentStepRef.current !== idx) return;
        computePosition();
        requestAnimationFrame(() => {
          computePosition();
          setFallbackMode(false);
          setTransitionMessage(null);
          setReady(true);
        });
      }, 300);
    }, 450);
  }, [cleanupPrevious, computePosition, enableFallback, isElementVisible]);

  /* ---- run actions before highlighting ---- */

  const waitForTargetThenCb = useCallback((selector: string, cb: () => void, maxWait = TARGET_WAIT_MS) => {
    if (selector === 'fullscreen') {
      cb();
      return;
    }
    const start = Date.now();
    const poll = () => {
      const el = document.querySelector(selector);
      if (isElementVisible(el)) {
        setTimeout(cb, 150);
        return;
      }
      if (Date.now() - start > maxWait) {
        cb();
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  }, [isElementVisible]);

  const runStepAction = useCallback((s: GuideStep, cb: () => void) => {
    if (s.activateTab) {
      const tabBtn = document.querySelector(`[data-tour="tab-${s.activateTab}"]`) as HTMLElement | null;
      if (tabBtn) tabBtn.click();
    }
    cb();
  }, []);

  /* ---- step lifecycle ---- */

  const navigatingRef = useRef(false);

  useEffect(() => {
    const s = STEPS[currentStep];
    if (!s) return;

    const targetPath = getPagePath(s.page);
    const cur = location.pathname;

    // If we need to navigate, do it and wait for the pathname to update
    if (cur !== targetPath) {
      if (!navigatingRef.current) {
        navigatingRef.current = true;
        navigate(targetPath);
      }
      return; // Wait for pathname change to re-trigger
    }

    // We're on the correct page now
    navigatingRef.current = false;

    clearRetry();
    cleanupPrevious();
    setReady(false);
    setFallbackMode(false);
    setTransitionMessage('Preparing the next part of the tour...');
    setTooltipPos(null);
    setSpotRect(null);

    const timer = setTimeout(() => {
      runStepAction(s, highlightElement);
    }, 400);
    failsafeTimerRef.current = setTimeout(() => {
      if (!readyRef.current && currentStepRef.current === currentStep) {
        enableFallback('This part of the app is taking longer than expected. You can continue without waiting.');
      }
    }, STEP_FAILSAFE_MS);

    return () => {
      clearTimeout(timer);
      clearRetry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, location.pathname]);

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
      setFallbackMode(false);
      setCurrentStep(prev => prev - 1);
    }
  };

  const finish = () => {
    cleanupPrevious();
    clearRetry();
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ACTIVE_TOUR_KEY);
    sessionStorage.removeItem(ACTIVE_TOUR_USER_KEY);
    sessionStorage.removeItem(RETAKE_TOUR_KEY);
    sessionStorage.setItem('first_session_guide_done', '1');
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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl p-8 shadow-2xl mx-4 max-w-sm w-full text-center">
          <h2 className="text-2xl font-headline text-white leading-tight mb-3">
            Let's show you around.
          </h2>
          <p className="text-sm text-white/60 font-body leading-relaxed mb-8">
            A quick 3-step tour of how Mind Module works — starting with your daily check-in.
          </p>
          <button
            onClick={dismissIntroAndStart}
            className="w-full py-3.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20 mb-3"
          >
            Start Tour
          </button>
          <button
            onClick={skipTourEntirely}
            className="text-sm text-white/50 hover:text-white transition-colors font-medium"
          >
            Skip tour
          </button>
        </div>
      </div>
    );
  }

  /* ---- tooltip position styles ---- */

  const tooltipStyle: React.CSSProperties =
    isFullscreen || fallbackMode || tooltipPos === null
      ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)' }
      : { top: `${tooltipPos.top}px`, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)' };

  const tooltipMaxW = isFullscreen || fallbackMode ? '360px' : '400px';
  const showTransitionCard = !ready && !fallbackMode;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
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
          className="absolute z-[10000] pointer-events-none border-2 border-saffron/30 transition-all duration-500"
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

      {/* Block interactions outside the spotlight */}
      {spotRect ? (
        <>
          <div className="absolute left-0 right-0 top-0" style={{ height: Math.max(spotRect.y, 0), pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
          <div className="absolute left-0" style={{ top: Math.max(spotRect.y, 0), width: Math.max(spotRect.x, 0), height: Math.max(spotRect.h, 0), pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
          <div className="absolute right-0" style={{ top: Math.max(spotRect.y, 0), width: Math.max(window.innerWidth - (spotRect.x + spotRect.w), 0), height: Math.max(spotRect.h, 0), pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
          <div className="absolute left-0 right-0 bottom-0" style={{ top: Math.max(spotRect.y + spotRect.h, 0), pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()} />
      )}

      {/* Skip */}
      <button
        onClick={finish}
        className="absolute right-4 z-[10010] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', pointerEvents: 'auto' }}
      >
        Skip <X size={14} />
      </button>

      {/* Tooltip Card */}
      <div
        ref={tooltipRef}
        className={cn(
          'fixed z-[10010] bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl p-5 shadow-2xl mx-auto transition-opacity duration-300',
          ready ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ ...tooltipStyle, maxWidth: tooltipMaxW, pointerEvents: ready ? 'auto' : 'none' }}
      >
        {/* Phase + counter */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-white/60">
            {step.phaseLabel}
          </p>
          <p className="text-[10px] text-white/50 font-medium">
            {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        <h2 className="text-lg font-headline text-white leading-tight mb-2">{step.title}</h2>
        <p className="text-sm text-white/70 font-body leading-relaxed mb-5">{step.body}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  idx === currentStep ? 'w-5 bg-saffron' : idx < currentStep ? 'w-1.5 bg-saffron/40' : 'w-1.5 bg-white/25',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button onClick={handleBack} className="flex items-center gap-1 px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm transition-colors" style={{ pointerEvents: 'auto' }}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {isLastStep ? (
              <button onClick={finish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-saffron text-black font-semibold text-sm hover:bg-saffron/90 transition-colors shadow-lg shadow-saffron/20" style={{ pointerEvents: 'auto' }}>
                <Rocket size={16} /> Let's Go!
              </button>
            ) : (
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm border border-white/10 transition-colors" style={{ pointerEvents: 'auto' }}>
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {showTransitionCard && (
        <div
          className="fixed z-[10010] bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl p-5 shadow-2xl mx-auto"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)', maxWidth: '360px' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium text-white/60">
              {step.phaseLabel}
            </p>
            <p className="text-[10px] text-white/50 font-medium">
              {currentStep + 1} of {STEPS.length}
            </p>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-saffron flex-shrink-0" />
            <div>
              <h2 className="text-lg font-headline text-white leading-tight mb-1">{step.title}</h2>
              <p className="text-sm text-white/60 font-body leading-relaxed">
                {transitionMessage || 'Preparing the next part of the tour...'}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  idx === currentStep ? 'w-5 bg-saffron' : idx < currentStep ? 'w-1.5 bg-saffron/40' : 'w-1.5 bg-white/25',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  , document.body);
};

function getPagePath(page: string): string {
  switch (page) {
    case 'home': return '/executive-home';
    case 'check-in': return '/daily-check-in';
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
