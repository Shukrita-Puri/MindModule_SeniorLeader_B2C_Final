import { TrendingUp } from "lucide-react";
import { DevelopmentArea } from "@/hooks/useSessionDebrief";

interface DevelopmentAreasSectionProps {
  developmentAreas: DevelopmentArea[];
}

const DevelopmentAreasSection = ({ developmentAreas }: DevelopmentAreasSectionProps) => {
  if (!developmentAreas.length) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-heading font-medium text-foreground">
          Development Areas
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          No development areas identified in this session. Great work!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-heading font-medium text-foreground">
        Development Areas
      </h3>
      
      <div className="space-y-4">
        {developmentAreas.map((area, index) => (
          <div 
            key={index}
            className="bg-muted/30 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <TrendingUp size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground font-body">
                  {area.metaSkill}
                  {area.subSkill && (
                    <span className="text-muted-foreground font-normal"> → {area.subSkill}</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground font-body mt-1">
                  {area.observation}
                </p>
              </div>
            </div>
            
            {area.actionSuggested && (
              <div className="ml-11 bg-forest/5 dark:bg-forest/10 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-forest mb-1">Suggested Action</p>
                <p className="text-sm text-foreground font-body">
                  {area.actionSuggested}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DevelopmentAreasSection;
