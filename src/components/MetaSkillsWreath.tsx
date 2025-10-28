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
              width="140"
              height="120"
              viewBox="0 0 140 120"
              className="drop-shadow-lg"
            >
              <defs>
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="1" />
                  <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0.7" />
                </linearGradient>
              </defs>
              
              {/* Left laurel branch */}
              <path
                d="M 30 90 Q 25 85, 20 80 Q 18 70, 20 60 Q 22 50, 25 40 Q 28 30, 32 20"
                fill="none"
                stroke="url(#goldGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Left laurel leaves */}
              {[20, 30, 40, 50, 60, 70, 80].map((y, i) => (
                <ellipse
                  key={`left-${i}`}
                  cx={30 - (90 - y) * 0.08}
                  cy={y}
                  rx="6"
                  ry="10"
                  fill="url(#goldGradient)"
                  opacity="0.85"
                  transform={`rotate(${-35 + i * 2} ${30 - (90 - y) * 0.08} ${y})`}
                />
              ))}
              
              {/* Right laurel branch */}
              <path
                d="M 110 90 Q 115 85, 120 80 Q 122 70, 120 60 Q 118 50, 115 40 Q 112 30, 108 20"
                fill="none"
                stroke="url(#goldGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Right laurel leaves */}
              {[20, 30, 40, 50, 60, 70, 80].map((y, i) => (
                <ellipse
                  key={`right-${i}`}
                  cx={110 + (90 - y) * 0.08}
                  cy={y}
                  rx="6"
                  ry="10"
                  fill="url(#goldGradient)"
                  opacity="0.85"
                  transform={`rotate(${35 - i * 2} ${110 + (90 - y) * 0.08} ${y})`}
                />
              ))}
              
              {/* Bottom bow/ribbon */}
              <path
                d="M 55 95 Q 60 92, 65 90 Q 70 88, 75 90 Q 80 92, 85 95"
                fill="none"
                stroke="url(#goldGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M 55 95 Q 50 100, 45 105 M 85 95 Q 90 100, 95 105"
                fill="none"
                stroke="url(#goldGradient)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              
              {/* Center percentage or count - PROMINENT */}
              <text
                x="70"
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
                x="70"
                y="80"
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
