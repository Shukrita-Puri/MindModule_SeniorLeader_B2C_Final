import { Sparkles } from "lucide-react";

interface BenefitHookProps {
  message: string;
}

export const BenefitHook = ({ message }: BenefitHookProps) => {
  return (
    <div className="bg-gradient-to-r from-primary/5 via-gold/5 to-primary/5 border border-gold/20 rounded-lg p-4 mt-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={14} className="text-gold" />
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed font-body italic">
          {message}
        </p>
      </div>
    </div>
  );
};
