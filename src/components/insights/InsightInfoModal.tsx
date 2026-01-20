import { Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface InsightInfoModalProps {
  title: string;
  explanation: string;
  className?: string;
}

const InsightInfoModal = ({ title, explanation, className }: InsightInfoModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={cn("text-muted-foreground/60 hover:text-foreground transition-colors", className)}
        aria-label={`Info about ${title}`}
      >
        <Info size={14} />
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal content */}
          <div 
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{explanation}</p>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InsightInfoModal;
