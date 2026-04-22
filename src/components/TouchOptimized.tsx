
import { ReactNode, TouchEvent, MouseEvent, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TouchOptimizedProps {
  children: ReactNode;
  onTap?: () => void;
  onLongPress?: () => void;
  className?: string;
  disabled?: boolean;
  haptic?: boolean;
  /**
   * ARIA role override. Defaults to "button" when onTap is provided.
   * Pass `false` to suppress the role entirely (decorative wrappers).
   */
  role?: string | false;
  /** Optional accessible label, applied as aria-label when provided. */
  ariaLabel?: string;
}

export const TouchOptimized = ({ 
  children, 
  onTap, 
  onLongPress, 
  className, 
  disabled = false,
  haptic = true,
  role,
  ariaLabel,
}: TouchOptimizedProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);
  // Tracks whether a touch gesture already triggered onTap so the synthetic
  // click that iOS fires ~300ms later doesn't double-invoke the handler.
  const touchHandledRef = useRef(false);
  const touchHandledTimerRef = useRef<NodeJS.Timeout | null>(null);

  const MOVE_THRESHOLD = 10; // pixels – beyond this, treat as swipe not tap

  const handleTouchStart = (e: TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchMoved.current = false;
    setIsPressed(true);
    
    if (haptic && navigator.vibrate) {
      navigator.vibrate(10);
    }

    if (onLongPress) {
      const timer = setTimeout(() => {
        if (!touchMoved.current) {
          onLongPress();
          if (haptic && navigator.vibrate) {
            navigator.vibrate([50, 50, 50]);
          }
        }
      }, 500);
      setLongPressTimer(timer);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (disabled || !touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      touchMoved.current = true;
      // Cancel long press if finger moved
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        setLongPressTimer(null);
      }
    }
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    
    setIsPressed(false);
    
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    // Only fire tap if finger didn't move significantly (not a swipe/scroll)
    if (onTap && !touchMoved.current) {
      onTap();
      // Mark this gesture as handled so the synthetic click that follows
      // touchend on mobile browsers is swallowed by handleClick.
      touchHandledRef.current = true;
      if (touchHandledTimerRef.current) clearTimeout(touchHandledTimerRef.current);
      touchHandledTimerRef.current = setTimeout(() => {
        touchHandledRef.current = false;
        touchHandledTimerRef.current = null;
      }, 500);
    }

    touchStartPos.current = null;
  };

  const handleTouchCancel = () => {
    setIsPressed(false);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleClick = (_e: MouseEvent) => {
    if (disabled) return;
    // Touch already fired onTap – swallow the synthetic click to avoid double-fire.
    if (touchHandledRef.current) return;
    if (onTap) {
      onTap();
    }
  };

  const handleMouseDown = () => {
    if (disabled) return;
    setIsPressed(true);
  };

  const handleMouseUp = () => {
    if (disabled) return;
    setIsPressed(false);
  };

  // Keyboard activation: a div with role="button" must respond to Enter and
  // Space the way a native <button> does. Without this the wrapper is a poor
  // semantic substitute when used by keyboard or screen-reader users.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !onTap) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // Prevent Space from scrolling the page and prevent the synthetic
      // click that some browsers fire after keyup so we don't double-invoke.
      e.preventDefault();
      touchHandledRef.current = true;
      if (touchHandledTimerRef.current) clearTimeout(touchHandledTimerRef.current);
      touchHandledTimerRef.current = setTimeout(() => {
        touchHandledRef.current = false;
        touchHandledTimerRef.current = null;
      }, 500);
      onTap();
    }
  };

  const resolvedRole = role === false ? undefined : role ?? (onTap ? 'button' : undefined);
  const isInteractive = !!onTap;

  return (
    <div
      className={cn(
        "touch-manipulation select-none transition-all duration-150 cursor-pointer",
        "min-h-[44px] min-w-[44px]", // Minimum touch target size
        isPressed && "scale-95 opacity-80",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={resolvedRole}
      tabIndex={isInteractive && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {children}
    </div>
  );
};

export default TouchOptimized;
