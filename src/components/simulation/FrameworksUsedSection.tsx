import { BookOpen, Quote } from "lucide-react";
import { Framework } from "@/hooks/useSessionDebrief";

interface FrameworksUsedSectionProps {
  frameworks: Framework[];
}

const FrameworksUsedSection = ({ frameworks }: FrameworksUsedSectionProps) => {
  if (!frameworks.length) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl md:text-2xl font-heading font-bold text-primary">
          Frameworks & Models
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          No specific frameworks were applied in this session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl md:text-2xl font-heading font-bold text-primary">
        Frameworks & Models
      </h3>
      
      <div className="grid gap-4 md:grid-cols-2">
        {frameworks.map((framework, index) => (
          <div 
            key={index}
            className="bg-muted/30 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <BookOpen size={16} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground font-body">
                  {framework.name}
                </p>
                {framework.attribution && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {framework.attribution}
                  </p>
                )}
              </div>
            </div>
            
            {framework.wisdomQuote && (
              <div className="flex gap-2 mt-2">
                <Quote size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground font-body italic">
                  "{framework.wisdomQuote}"
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FrameworksUsedSection;
