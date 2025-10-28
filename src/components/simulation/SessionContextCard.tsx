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
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-1">
          Session Domain
        </p>
        <p className="text-sm font-medium text-foreground font-body">
          {formatDomainName(scenarioDomain || "")}
        </p>
      </div>

      {contextType && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-1">
            Context Type
          </p>
          <p className="text-sm font-medium text-foreground font-body">
            {contextType}
          </p>
        </div>
      )}

      {personasText() && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-1">
            Dialogue Participants
          </p>
          <p className="text-sm font-medium text-foreground font-body">
            {personasText()}
          </p>
        </div>
      )}

      {scenarioContext && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-1">
            Scenario Context
          </p>
          <p className="text-sm text-muted-foreground font-body leading-relaxed">
            {scenarioContext}
          </p>
        </div>
      )}
      
      <div className="border-t border-gold/40 mt-6" />
    </div>
  );
};

export default SessionContextCard;