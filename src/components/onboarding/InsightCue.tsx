import { useState } from "react";
import { Lightbulb, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InsightCueProps {
  title?: string;
  content: string;
  onContinue: () => void;
}

export const InsightCue = ({
  title = "Research Insight",
  content,
  onContinue,
}: InsightCueProps) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleContinue = () => {
    setIsVisible(false);
    setTimeout(onContinue, 300);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-br from-gold/5 via-background to-background border border-gold/25 rounded-xl p-5 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center">
          <Lightbulb size={16} className="text-gold" />
        </div>
        <h3 className="text-sm font-semibold text-gold tracking-wide uppercase">
          {title}
        </h3>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed font-body">
        {content}
      </p>

      <Button
        onClick={handleContinue}
        variant="outline"
        className="w-full border-gold/30 text-gold hover:bg-gold hover:text-primary-foreground"
      >
        Next Question
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
};
