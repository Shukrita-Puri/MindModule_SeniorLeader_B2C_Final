import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SessionContextCardProps {
  scenarioDomain?: string;
  contextType?: string;
  scenarioContext?: string;
  selectedPersonas?: string[];
  customPersonas?: string;
}

const SessionContextCard = ({ scenarioDomain, contextType, scenarioContext, selectedPersonas, customPersonas }: SessionContextCardProps) => {
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
    <div className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-6 border border-border/10 shadow-sm">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4 font-heading">Session Context</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domain</span>
            <p className="text-foreground font-body mt-1">{formatDomainName(scenarioDomain || "")}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scenario</span>
            <p className="text-foreground font-body mt-1">{contextType}</p>
          </div>
        </div>
        
        {personasText() && (
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personas</span>
            <p className="text-foreground text-sm font-body mt-1">{personasText()}</p>
          </div>
        )}
        
        {scenarioContext && (
          <div className="pt-4 border-t border-gold/20">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom Context</span>
            <p className="text-foreground text-sm leading-relaxed font-body mt-2">{scenarioContext}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionContextCard;