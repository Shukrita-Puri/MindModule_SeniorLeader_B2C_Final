import { useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const MentalModelsSection = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const mentalModels = [
    {
      title: "Growth Mindset",
      attribution: "Jeff Bezos's Practice",
      description: "View challenges as opportunities to develop your abilities",
      application: "When facing difficult situations, ask 'What can I learn from this?' rather than 'Why is this happening to me?'"
    },
    {
      title: "The Middle Way",
      attribution: "Ancient Buddhist Wisdom",
      description: "Balance between extremes leads to wise decision-making",
      application: "When facing difficult choices, avoid all-or-nothing thinking and seek the balanced path that honors multiple perspectives"
    },
    {
      title: "STOP Technique",
      attribution: "Navy SEAL Practice",
      description: "Stop, Take a breath, Observe, Proceed with awareness",
      application: "Use before big conversations, tests, or when feeling overwhelmed to regain composure and clarity"
    }
  ];

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                Mental Studio Frameworks to Apply
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                Time-tested wisdom from high performers and ancient traditions
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {mentalModels.map((model, index) => (
              <div 
                key={index}
                className="group space-y-3 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Placeholder for horizontal ink/pencil banner */}
                <div className="w-full h-20 bg-gradient-to-r from-muted/30 via-muted/50 to-muted/30 rounded border border-gold/20 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground font-body italic">Visual banner placeholder</span>
                </div>
                
                <div className="border-l-2 border-gold/40 pl-4 hover:border-gold/60 transition-colors">
                  <h4 className="font-heading font-medium text-foreground mb-1 text-base">
                    {model.title}
                  </h4>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold/10 border border-gold/20 mb-2">
                    <Brain size={10} className="text-gold" />
                    <span className="text-xs text-gold font-medium font-body">{model.attribution}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2 font-body leading-relaxed">
                    {model.description}
                  </p>
                  <div className="pt-2 border-t border-gold/20">
                    <p className="text-xs font-medium text-foreground mb-1 font-body">Application:</p>
                    <p className="text-xs text-muted-foreground font-body leading-relaxed">
                      {model.application}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MentalModelsSection;
