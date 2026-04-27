import { useEffect, useRef, RefObject } from "react";

interface SwipeHandlerOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum horizontal distance (px) before a swipe fires. */
  threshold?: number;
  /**
   * Element to attach listeners to. If omitted, falls back to `document`.
   * Strongly preferred for in-page carousels so we don't intercept browser
   * back/forward swipes globally.
   */
  targetRef?: RefObject<HTMLElement | null>;
  /** Disable the handler without unmounting. */
  enabled?: boolean;
  /**
   * Pixel distance from the left/right viewport edge inside which we ignore
   * swipes. This lets iOS Safari + browser native back/forward gestures win.
   * Defaults to 24.
   */
  edgeGuardPx?: number;
}

export const useSwipeHandler = ({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  targetRef,
  enabled = true,
  edgeGuardPx = 24,
}: SwipeHandlerOptions) => {
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const ignoreGesture = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const target: HTMLElement | Document =
      (targetRef?.current as HTMLElement | null) ?? document;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      touchStartX.current = touch.screenX;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
      // Ignore gestures starting near either edge — those belong to the OS/browser.
      ignoreGesture.current =
        touch.clientX < edgeGuardPx ||
        (vw > 0 && touch.clientX > vw - edgeGuardPx);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (ignoreGesture.current) {
        ignoreGesture.current = false;
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      touchEndX.current = touch.screenX;
      const distance = touchStartX.current - touchEndX.current;
      if (distance > threshold && onSwipeLeft) onSwipeLeft();
      if (distance < -threshold && onSwipeRight) onSwipeRight();
    };

    target.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true } as AddEventListenerOptions);
    target.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true } as AddEventListenerOptions);

    return () => {
      target.removeEventListener('touchstart', handleTouchStart as EventListener);
      target.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, targetRef, enabled, edgeGuardPx]);
};
