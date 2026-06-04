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
    "bg-white border-0",
    "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
    className
  )}>
    {children}
  </Card>
);

export default LuxuryInsightCard;
