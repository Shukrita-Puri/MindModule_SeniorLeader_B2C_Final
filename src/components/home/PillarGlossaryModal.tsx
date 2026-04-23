import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PillarGlossaryModalProps {
  title: string;
  short: string;
  clinical?: string;
  className?: string;
}

/**
 * Centered frosted-glass modal for pillar glossary definitions.
 * Mirrors MetricInfoModal/InsightInfoModal pattern (mobile-native tooltip standard).
 */
const PillarGlossaryModal = ({ title, short, clinical, className }: PillarGlossaryModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        aria-label={`What does ${title} measure?`}
        className={cn(
          'inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-[hsl(var(--taupe)/.10)] active:bg-[hsl(var(--taupe)/.18)] transition-colors',
          className
        )}
      >
        <Info className="w-3.5 h-3.5 text-[hsl(var(--taupe))]" strokeWidth={2} />
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />

          <div
            className="relative bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-5 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-medium text-foreground mb-2">{title}</h3>
            <p className="text-sm text-foreground/85 leading-relaxed font-body">{short}</p>
            {clinical && (
              <>
                <div className="my-3 h-px bg-[hsl(var(--taupe)/.25)]" />
                <p className="text-[12px] leading-relaxed text-muted-foreground/90 font-body whitespace-pre-line">
                  {clinical}
                </p>
              </>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default PillarGlossaryModal;
