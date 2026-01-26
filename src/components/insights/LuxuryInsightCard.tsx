import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LuxuryInsightCardProps {
  children: ReactNode;
  className?: string;
}

export const LuxuryInsightCard = ({ children, className }: LuxuryInsightCardProps) => (
  <Card className={cn(
    "relative overflow-hidden",
    "bg-gradient-to-br from-card via-card to-card/95",
    "border border-white/10 dark:border-white/5",
    "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
    "backdrop-blur-sm",
    className
  )}>
    {/* Top glass highlight */}
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    {/* Inner glow */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,140,66,0.03)_0%,transparent_50%)] pointer-events-none" />
    {children}
  </Card>
);

export default LuxuryInsightCard;
