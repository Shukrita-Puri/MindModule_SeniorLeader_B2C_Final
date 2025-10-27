import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetaSkillData {
  cluster: string;
  metaSkill: string;
  subSkills: string[];
}

interface MetaSkillsWreathProps {
  metaSkills: MetaSkillData[];
  className?: string;
}

const MetaSkillsWreath = ({ metaSkills, className = "" }: MetaSkillsWreathProps) => {
  const count = metaSkills.length;
  const uniqueClusters = [...new Set(metaSkills.map(skill => skill.cluster))];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative ${className}`}>
            <svg
              width="100"
              height="120"
              viewBox="0 0 100 120"
              className="drop-shadow-lg"
            >
              {/* Left laurel branch */}
              <g transform="translate(10, 20)">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <ellipse
                    key={`left-${i}`}
                    cx={i * 2.5}
                    cy={i * 8}
                    rx="5"
                    ry="9"
                    fill="hsl(var(--gold))"
                    opacity="0.9"
                    transform={`rotate(${-35 + i * 12} ${i * 2.5} ${i * 8})`}
                  />
                ))}
              </g>

              {/* Right laurel branch */}
              <g transform="translate(73, 20)">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <ellipse
                    key={`right-${i}`}
                    cx={i * 2.5}
                    cy={i * 8}
                    rx="5"
                    ry="9"
                    fill="hsl(var(--gold))"
                    opacity="0.9"
                    transform={`rotate(${35 - i * 12} ${i * 2.5} ${i * 8})`}
                  />
                ))}
              </g>

              {/* Bottom ribbon decoration */}
              <path
                d="M 35 78 Q 50 82 65 78"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="2"
                opacity="0.8"
              />
              <path
                d="M 38 80 L 35 88 L 40 82"
                fill="hsl(var(--gold))"
                opacity="0.8"
              />
              <path
                d="M 62 80 L 65 88 L 60 82"
                fill="hsl(var(--gold))"
                opacity="0.8"
              />

              {/* Center count - PROMINENT */}
              <text
                x="50"
                y="52"
                textAnchor="middle"
                className="font-headline font-bold"
                fontSize="40"
                fill="hsl(var(--gold))"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
              >
                {count}
              </text>

              {/* "Meta Skills" text at bottom */}
              <text
                x="50"
                y="105"
                textAnchor="middle"
                className="font-body text-[9px] tracking-widest uppercase"
                fill="hsl(var(--gold))"
                opacity="0.85"
              >
                Meta Skills
              </text>

              {/* Subtle glow effect */}
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="0.5"
                opacity="0.2"
                className="animate-pulse"
              />
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
