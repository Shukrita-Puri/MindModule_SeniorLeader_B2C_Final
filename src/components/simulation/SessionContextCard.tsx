import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SessionContextCardProps {
  scenarioDomain?: string;
  contextType?: string;
  scenarioContext?: string;
}

const SessionContextCard = ({ scenarioDomain, contextType, scenarioContext }: SessionContextCardProps) => {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl font-heading text-foreground">Session Context</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground font-body leading-relaxed">
          <strong>Domain:</strong> {scenarioDomain}<br/>
          <strong>Scenario:</strong> {contextType}<br/>
          {scenarioContext && (
            <>
              <strong>Context:</strong> {scenarioContext}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
};

export default SessionContextCard;