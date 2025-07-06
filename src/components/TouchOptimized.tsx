
import { ReactNode, TouchEvent, useState } from 'react';
import { cn } from '@/lib/utils';

interface TouchOptimizedProps {
  children: ReactNode;
  onTap?: () => void;
  onLongPress?: () => void;
  className?: string;
  disabled?: boolean;
  haptic?: boolean;
}

export const TouchOptimized = ({ 
  children, 
  onTap, 
  onLongPress, 
  className, 
  disabled = false,
  haptic = true 
}: TouchOptimizedProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: TouchEvent) => {
    if (disabled) return;
    
    setIsPressed(true);
    
    if (haptic && navigator.vibrate) {
      navigator.vibrate(10);
    }

    if (onLongPress) {
      const timer = setTimeout(() => {
        onLongPress();
        if (haptic && navigator.vibrate) {
          navigator.vibrate([50, 50, 50]);
        }
      }, 500);
      setLongPressTimer(timer);
    }
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    
    setIsPressed(false);
    
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    if (onTap) {
      onTap();
    }
  };

  const handleTouchCancel = () => {
    setIsPressed(false);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  return (
    <div
      className={cn(
        "touch-manipulation select-none transition-all duration-150",
        "min-h-[44px] min-w-[44px]", // Minimum touch target size
        isPressed && "scale-95 opacity-80",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
    >
      {children}
    </div>
  );
};

export default TouchOptimized;
