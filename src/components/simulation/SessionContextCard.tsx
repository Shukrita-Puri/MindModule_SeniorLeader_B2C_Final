import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SessionContextCardProps {
  scenarioDomain?: string;
  contextType?: string;
  scenarioContext?: string;
  selectedPersonas?: string[];
  customPersonas?: string;
}

const SessionContextCard = ({ scenarioDomain, contextType, scenarioContext, selectedPersonas, customPersonas }: SessionContextCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const formatDomainName = (domain: string) => {
    const domainMap: Record<string, string> = {
      "peer-relationships": "Peer Relationships",
      "authority-figures": "Authority Figures", 
      "college-interviews": "College/University Prep",
      "romantic-relationships": "Dating & Romance",
      "group-leadership": "Group Leadership",
      "difficult-conversations": "Difficult Conversations",
      "custom-scenario": "Custom Scenario"
    };
    return domainMap[domain] || domain;
  };

  const personasText = () => {
    let text = "";
    if (selectedPersonas && selectedPersonas.length > 0) {
      text += selectedPersonas.join(", ");
    }
    if (customPersonas && customPersonas.trim()) {
      text += (text ? "; " : "") + customPersonas;
    }
    return text;
  };

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200">
              Session Context
            </h3>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 mt-4">
            {scenarioDomain && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground font-body">
                  Dialogue Category
                </p>
                <p className="text-sm text-muted-foreground font-body">
                  {formatDomainName(scenarioDomain)}
                </p>
              </div>
            )}

            {personasText() && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground font-body">
                  Dialogue Participants
                </p>
                <p className="text-sm text-muted-foreground font-body">
                  {personasText()}
                </p>
              </div>
            )}

            {scenarioContext && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground font-body">
                  Dialogue Scenario
                </p>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">
                  {scenarioContext}
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default SessionContextCard;