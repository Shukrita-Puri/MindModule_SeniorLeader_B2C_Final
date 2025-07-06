
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorMessageProps {
  message: string;
  className?: string;
}

export const ErrorMessage = ({ message, className }: ErrorMessageProps) => {
  if (!message) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 mt-2",
      className
    )}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
};

export default ErrorMessage;
