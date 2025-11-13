import { Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface MetricInfoModalProps {
  title: string;
  description: string;
  className?: string;
}

const MetricInfoModal = ({ title, description, className }: MetricInfoModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
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
          {/* Blur backdrop - only blurs the parent card area */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          
          {/* Modal content */}
          <div 
            className="relative bg-card border border-border rounded-xl p-6 max-w-sm shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
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

export default MetricInfoModal;
