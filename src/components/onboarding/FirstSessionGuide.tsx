/**
 * First Session Spotlight Walkthrough
 *
 * A guided demo that highlights real UI elements on the actual pages.
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
import {
  FST_KEYS,
  clearFirstSessionTour,
  hasIntroBeenSeen,
  markIntroSeen,
  setTourStep,
  getTourStep,
  getTourSource,
} from '@/utils/firstSessionTour';
import { setTourMockActive } from './useTourMock';

/* ------------------------------------------------------------------ */
/*  Step definitions                                                   */
/* ------------------------------------------------------------------ */

interface GuideStep {
  targetSelector: string;
  /**
   * Optional selector to use on viewports ≥ 640px (Tailwind `sm`).
   * The bottom pill nav that owns `[data-tour="bottom-nav-*"]` is
   * `sm:hidden`, so desktop/tablet steps must fall back to the
   * equivalent sidebar anchor. If omitted, `targetSelector` is used
   * on every viewport.
   */
  desktopTargetSelector?: string;
  title: string;
  body: string;
  page: 'check-in' | 'home' | 'plan';
  phaseLabel: string;
  scrollToTop?: boolean;
  scrollBlock?: ScrollLogicalPosition;
  spotlightPad?: number;
  spotlightCircle?: boolean;
  tooltipPosition?: 'above' | 'below' | 'auto';
  activateTab?: 'mrs' | 'brief' | 'plan';
  openSidebar?: boolean;
  /**
   * Override for `openSidebar` on viewports ≥ 640px. Used together
   * with `desktopTargetSelector` when the desktop equivalent lives
   * inside the collapsible sidebar.
   */
  desktopOpenSidebar?: boolean;
}

const STEPS: GuideStep[] = [
  {
    targetSelector: '[data-tour="check-in-card"]',
    title: 'Performance Readiness Assessment',
    body: "One tap. The system reads your sharpness, clarity, and confidence.",
    page: 'check-in',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'below',
    spotlightPad: 8,
  },
  {
    targetSelector: '[data-tour="mrs-page"]',
    title: 'Mental Readiness Score',
    body: 'Your live state translated into a score you can act on before the day starts acting on you.',
    page: 'home',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'below',
    activateTab: 'mrs',
    spotlightPad: 8,
  },
  {
    targetSelector: '[data-tour="today-state"]',
    title: 'Your Decision Engine',
    body: 'Internal signals, calendar pressure, and wearable data — triangulated into one readiness brief.',
    page: 'home',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'start',
    tooltipPosition: 'below',
    activateTab: 'brief',
    spotlightPad: 8,
  },
  {
    targetSelector: '[data-tour="daily-plan"]',
    title: 'Performance Mastery Plan',
    body: "Today's plan — built to close the gap between state and demand.",
    page: 'plan',
    phaseLabel: 'YOUR DAILY LOOP',
    scrollBlock: 'center',
    tooltipPosition: 'above',
    spotlightPad: 8,
  },
  {
    targetSelector: '[data-tour="bottom-nav-reset"]',
    // Bottom nav is mobile-only (`sm:hidden`); on desktop/tablet the
    // equivalent lives in the sidebar (Recalibrate = features[4]).
    desktopTargetSelector: '[data-tour="sidebar-suite-4"]',
    desktopOpenSidebar: true,
    title: 'Reset on demand',
    body:
      'A library of short Pause, Flow, and Reenergise mindset and somatic protocols. Open the Reset button before a high-stakes moment to prepare — or after one to prevent stress carrying into the next.',
    page: 'home',
    phaseLabel: 'EXPLORE WHEN YOU NEED',
    tooltipPosition: 'auto',
    spotlightPad: 6,
  },
  {
    targetSelector: '[data-tour="bottom-nav-insights"]',
    // Bottom nav is mobile-only; on desktop/tablet use the sidebar
    // Insight entry (features[3]).
    desktopTargetSelector: '[data-tour="sidebar-suite-3"]',
    desktopOpenSidebar: true,
    title: 'See the patterns forming',
    body:
      'Open the Insight button to see how your progress and patterns forming through the week and month — you can see the exact moments that could cause stress, burnout or clarity drain and prevent it from happening.',
    page: 'home',
    phaseLabel: 'EXPLORE WHEN YOU NEED',
    tooltipPosition: 'auto',
    spotlightPad: 6,
  },
];

const SESSION_KEY = FST_KEYS.step;
const TARGET_WAIT_MS = 1800;
const RETRY_INTERVAL_MS = 150;
const MAX_RETRIES = 10;
const STEP_FAILSAFE_MS = 3500;

/**
 * Resolve the effective spotlight selector for a step given the
 * current viewport. On viewports ≥ 640px, prefer `desktopTargetSelector`
 * when provided (mobile-only anchors like the bottom pill nav do not
 * render there and would otherwise trigger the failsafe fallback).
 */
const isDesktopViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(min-width: 640px)').matches;

const effectiveSelector = (s: GuideStep) =>
  isDesktopViewport() && s.desktopTargetSelector ? s.desktopTargetSelector : s.targetSelector;

const effectiveOpenSidebar = (s: GuideStep) =>
  isDesktopViewport() && s.desktopOpenSidebar !== undefined
    ? s.desktopOpenSidebar
    : !!s.openSidebar;

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

  const savedStep = getTourStep();
  // Intro modal must only appear once per tour run. If the user navigated
  // back to step 0 from step 2, hasIntroBeenSeen() is true and we skip the
  // intro — otherwise the user would read it as "the tour restarted onboarding".
  const [showIntro, setShowIntro] = useState(() => savedStep === 0 && !hasIntroBeenSeen());
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

  // Persist step so cross-page re-mounts (DailyCheckIn ↔ ExecutiveHome) resume
  // at the same step — never reset to 0 on navigation.
  useEffect(() => {
    setTourStep(currentStep);
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
    const tooltipH = tooltipEl ? tooltipEl.offsetHeight : 260;
    const GAP = 16;
    // Use visualViewport so the tooltip stays fully visible on iOS even when
    // the on-screen keyboard, address bar, or pinch-zoom shifts the viewport.
    const vv = window.visualViewport;
    const viewportTop = vv?.offsetTop ?? 0;
    const vH = vv?.height ?? window.innerHeight;
    const viewportBottom = viewportTop + vH;
    const TOP_SAFE = 16;
    const BOTTOM_SAFE = 24;

    const spaceAbove = sy - viewportTop;
    const spaceBelow = viewportBottom - (sy + sh);
    const pref = s.tooltipPosition || 'below';

    let top: number;
    if (pref === 'above' && spaceAbove >= tooltipH + GAP + TOP_SAFE) {
      top = sy - tooltipH - GAP;
    } else if (pref === 'below' && spaceBelow >= tooltipH + GAP + BOTTOM_SAFE) {
      top = sy + sh + GAP;
    } else if (spaceBelow >= spaceAbove && spaceBelow >= tooltipH + GAP + BOTTOM_SAFE) {
      top = sy + sh + GAP;
    } else if (spaceAbove >= tooltipH + GAP + TOP_SAFE) {
      top = sy - tooltipH - GAP;
    } else {
      // Last resort: pin to viewport so the footer (Back/Next) is always tappable.
      top = viewportBottom - tooltipH - BOTTOM_SAFE;
    }

    // Hard clamp inside the visible viewport so the footer is never below fold.
    const minTop = viewportTop + TOP_SAFE;
    const maxTop = viewportBottom - tooltipH - BOTTOM_SAFE;
    top = Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));
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
      const vH = window.visualViewport?.height ?? window.innerHeight;

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
    if (s.openSidebar) {
      setSidebar(true);
      // Give the sheet/sidebar a tick to mount its anchors before polling.
      waitForTargetThenCb(s.targetSelector, cb);
      return;
    }
    if (!s.openSidebar && sidebarCtx) {
      // Steps that don't need the sidebar should never inherit it from the
      // previous step — close it so the spotlight has a clean canvas.
      setSidebar(false);
    }
    cb();
  }, [setSidebar, sidebarCtx, waitForTargetThenCb]);

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

  // Mount/unmount side-effects:
  //  - Defensive: if a retake user arrived from Profile, close any side
  //    panel left open by the previous page so the intro modal lands as
  //    the topmost surface.
  //  - Mark the TourMock flag so first-time users see demo Brief/Plan.
  //  - Cleanup: close the sidebar, drop the mock flag, clear retries.
  useEffect(() => {
    if (getTourSource() === 'retake') {
      setSidebar(false);
    }
    setTourMockActive(true);
    return () => {
      cleanupPrevious();
      clearRetry();
      setSidebar(false);
      setTourMockActive(false);
    };
  }, [cleanupPrevious, clearRetry, setSidebar]);

  // Re-measure on every event that can change visible viewport geometry.
  // visualViewport listeners cover iOS Safari's address-bar collapse, on-screen
  // keyboard, and pinch-zoom — none of which fire `resize` on `window`.
  useEffect(() => {
    if (!ready) return;
    const handler = () => {
      if (measureFrameRef.current) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = requestAnimationFrame(() => computePosition());
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', handler);
    vv?.addEventListener('scroll', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
      vv?.removeEventListener('resize', handler);
      vv?.removeEventListener('scroll', handler);
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
    clearFirstSessionTour({ markDone: true });
    setSidebar(false);
    onComplete();
  };

  const dismissIntroAndStart = () => {
    markIntroSeen();
    setShowIntro(false);
  };

  const skipTourEntirely = () => {
    markIntroSeen();
    setShowIntro(false);
    finish();
  };

  if (!step) return null;

  /* ---- Intro overlay (before tour begins) ---- */
  if (showIntro) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-8 shadow-2xl max-w-sm w-full max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto text-center">
          <h2 className="text-2xl font-headline text-white leading-tight mb-3">
            Let's show you around.
          </h2>
          <p className="text-sm text-white/60 font-body leading-relaxed mb-8">
            A quick {STEPS.length}-step tour of how Mind Module works — starting with your daily check-in.
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
  // Cap the card to the *visible* viewport so the footer (Back/Next/Skip) is
  // always tappable on iOS, even with the address bar showing or the keyboard
  // open. dvh on its own is unreliable in iOS WebView.
  const cardMaxHeight = 'min(calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px), 80vh)';
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
          'fixed z-[10010] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl mx-auto transition-opacity duration-300 flex flex-col overflow-hidden',
          ready ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ ...tooltipStyle, maxWidth: tooltipMaxW, maxHeight: cardMaxHeight, pointerEvents: ready ? 'auto' : 'none' }}
      >
        <div className="min-h-0 overflow-y-auto px-5 pt-5">
          {/* Phase + counter */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs tracking-[0.2em] uppercase font-medium text-white/60">
              {step.phaseLabel}
            </p>
            <p className="text-xs text-white/50 font-medium">
              {currentStep + 1} of {STEPS.length}
            </p>
          </div>

          <h2 className="text-lg font-headline text-white leading-tight mb-2">{step.title}</h2>
          <p className="text-sm text-white/70 font-body leading-relaxed pb-4">{step.body}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/10 bg-[#1a1a1a]/98 flex-shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
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
          <div className="flex items-center gap-2 flex-shrink-0">
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
          className="fixed z-[10010] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl mx-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 32px)', maxWidth: '360px' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs tracking-[0.2em] uppercase font-medium text-white/60">
              {step.phaseLabel}
            </p>
            <p className="text-xs text-white/50 font-medium">
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
    case 'plan': return '/plan';
    default: return '/';
  }
}

function useSidebarSafe() {
  try {
    return useSidebar();
  } catch {
    return null;
  }
}

export default FirstSessionGuide;
