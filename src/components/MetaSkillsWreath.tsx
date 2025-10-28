import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetaSkillData {
  cluster: string;
  metaSkill: string;
  subSkills: string[];
}

interface MetaSkillsWreathProps {
  metaSkills: MetaSkillData[];
  growthPercentage?: number;
  className?: string;
}

const MetaSkillsWreath = ({ metaSkills, growthPercentage = 0, className = "" }: MetaSkillsWreathProps) => {
  const count = metaSkills.length;
  const displayText = growthPercentage > 0 ? `${growthPercentage}%` : count.toString();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative ${className}`}>
            <svg
              width="120"
              height="100"
              viewBox="0 0 120 100"
              className="drop-shadow-lg"
            >
              {/* Gold wreath circle */}
              <circle
                cx="60"
                cy="50"
                r="45"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="3"
                opacity="0.4"
              />
              <circle
                cx="60"
                cy="50"
                r="38"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="1.5"
                opacity="0.2"
              />
              
              {/* Center percentage or count - PROMINENT */}
              <text
                x="60"
                y="58"
                textAnchor="middle"
                className="font-headline font-bold"
                fontSize={growthPercentage > 0 ? "32" : "40"}
                fill="hsl(var(--gold))"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
              >
                {displayText}
              </text>

              {/* "Meta Skills" or "Growth" text at bottom */}
              <text
                x="60"
                y="88"
                textAnchor="middle"
                className="font-body text-[9px] tracking-widest uppercase"
                fill="hsl(var(--gold))"
                opacity="0.85"
              >
                {growthPercentage > 0 ? "Growth" : "Meta Skills"}
              </text>
            </svg>
          </div>
        </TooltipTrigger>
        
        <TooltipContent 
          side="left" 
          className="max-w-xs bg-background/95 border-gold/30 p-4"
        >
          <div className="space-y-3">
            <p className="font-headline font-semibold text-sm text-foreground mb-2">
              Meta-Skills in Practice
            </p>
            {metaSkills.map((skill, index) => (
              <div key={index} className="space-y-1">
                <p className="text-xs font-medium text-primary/80">
                  {skill.cluster}
                </p>
                <p className="text-sm font-semibold text-gold">
                  {skill.metaSkill}
                </p>
                <div className="flex flex-wrap gap-1">
                  {skill.subSkills.slice(0, 3).map(subSkill => (
                    <span 
                      key={subSkill} 
                      className="text-[10px] text-muted-foreground"
                    >
                      #{subSkill.replace(/\s+/g, '')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MetaSkillsWreath;
