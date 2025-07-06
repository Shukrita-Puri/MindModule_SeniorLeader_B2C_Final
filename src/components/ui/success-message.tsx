
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessMessageProps {
  message: string;
  className?: string;
}

export const SuccessMessage = ({ message, className }: SuccessMessageProps) => {
  if (!message) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-3 mt-2",
      className
    )}>
      <CheckCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};

export default SuccessMessage;
