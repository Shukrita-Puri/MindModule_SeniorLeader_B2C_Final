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
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-heading text-foreground">Session Context</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">Domain:</span>
            <p className="text-foreground">{formatDomainName(scenarioDomain || "")}</p>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Scenario:</span>
            <p className="text-foreground">{contextType}</p>
          </div>
        </div>
        
        {personasText() && (
          <div>
            <span className="font-medium text-muted-foreground">Personas:</span>
            <p className="text-foreground text-sm">{personasText()}</p>
          </div>
        )}
        
        {scenarioContext && (
          <div>
            <span className="font-medium text-muted-foreground">Context:</span>
            <p className="text-foreground text-sm leading-relaxed">{scenarioContext}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SessionContextCard;