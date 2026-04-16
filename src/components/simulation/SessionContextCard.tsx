interface SessionContextCardProps {
  scenarioDomain?: string;
  contextType?: string;
  scenarioContext?: string;
  selectedPersonas?: string[];
  customPersonas?: string;
  sessionDuration?: number;
}

const SessionContextCard = ({ 
  scenarioDomain, 
  scenarioContext, 
  selectedPersonas, 
  customPersonas,
  sessionDuration 
}: SessionContextCardProps) => {
  
  const formatDomainName = (domain: string) => {
    const domainMap: Record<string, string> = {
      "peer-relationships": "Peer Relationships",
      "authority-figures": "Authority Figures", 
      "college-interviews": "College/University Prep",
      "romantic-relationships": "Dating & Romance",
      "group-leadership": "Group Leadership",
      "difficult-conversations": "Difficult Conversations",
      "custom-scenario": "Custom Scenario",
      "academic-confidence": "Academic Confidence",
      "social-navigation": "Social Mastery",
      "growth-opportunity": "Growth & Opportunity"
    };
    return domainMap[domain] || domain;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const getPersonaText = () => {
    if (customPersonas?.trim()) return customPersonas;
    if (selectedPersonas?.length) return selectedPersonas[0];
    return null;
  };

  const category = scenarioDomain ? formatDomainName(scenarioDomain) : null;
  const scenario = scenarioContext || null;
  const duration = formatDuration(sessionDuration);
  const persona = getPersonaText();

  // Build compact display parts
  const line1Parts = [category, scenario].filter(Boolean);
  const line2Parts = [duration, persona ? `with ${persona}` : null].filter(Boolean);

  if (!line1Parts.length && !line2Parts.length) return null;

  return (
    <div className="py-4">
      {line1Parts.length > 0 && (
        <p className="text-sm font-medium text-foreground font-body">
          {line1Parts.join(' • ')}
        </p>
      )}
      {line2Parts.length > 0 && (
        <p className="text-xs md:text-sm text-muted-foreground font-body mt-1">
          {line2Parts.join(' • ')}
        </p>
      )}
    </div>
  );
};

export default SessionContextCard;
