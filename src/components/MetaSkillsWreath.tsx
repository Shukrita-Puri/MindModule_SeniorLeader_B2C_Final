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
              width="140"
              height="140"
              viewBox="0 0 140 140"
              className="drop-shadow-xl"
            >
              {/* Dark background circle */}
              <circle
                cx="70"
                cy="70"
                r="55"
                fill="rgba(0, 0, 0, 0.85)"
                className="transition-all duration-300"
              />
              
              {/* Outer gold ring */}
              <circle
                cx="70"
                cy="70"
                r="58"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="1.5"
                opacity="0.6"
              />

              {/* Left laurel branch */}
              <g transform="translate(25, 45)">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <ellipse
                    key={`left-${i}`}
                    cx={i * 3}
                    cy={i * 8}
                    rx="6"
                    ry="10"
                    fill="hsl(var(--gold))"
                    opacity="0.85"
                    transform={`rotate(${-30 + i * 10} ${i * 3} ${i * 8})`}
                  />
                ))}
              </g>

              {/* Right laurel branch */}
              <g transform="translate(97, 45)">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <ellipse
                    key={`right-${i}`}
                    cx={i * 3}
                    cy={i * 8}
                    rx="6"
                    ry="10"
                    fill="hsl(var(--gold))"
                    opacity="0.85"
                    transform={`rotate(${30 - i * 10} ${i * 3} ${i * 8})`}
                  />
                ))}
              </g>

              {/* Bottom star decoration */}
              <path
                d="M 70 110 L 72 115 L 77 115 L 73 118 L 75 123 L 70 120 L 65 123 L 67 118 L 63 115 L 68 115 Z"
                fill="hsl(var(--gold))"
                opacity="0.9"
              />

              {/* Center count/text */}
              <text
                x="70"
                y="75"
                textAnchor="middle"
                className="font-headline font-bold"
                fontSize="32"
                fill="hsl(var(--gold))"
              >
                {count}
              </text>

              {/* "Meta Skills" curved text at top */}
              <defs>
                <path
                  id="curve"
                  d="M 20,70 A 50,50 0 0,1 120,70"
                  fill="none"
                />
              </defs>
              <text className="font-body text-[10px] tracking-wider" fill="hsl(var(--gold))" opacity="0.8">
                <textPath href="#curve" startOffset="50%" textAnchor="middle">
                  META SKILLS
                </textPath>
              </text>

              {/* Glow effect */}
              <circle
                cx="70"
                cy="70"
                r="55"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="0.5"
                opacity="0.3"
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
