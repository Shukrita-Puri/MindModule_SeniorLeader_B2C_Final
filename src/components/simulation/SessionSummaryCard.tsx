import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SessionSummaryCard = () => {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl font-heading text-foreground">Session Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground font-body leading-relaxed">
          You demonstrated strong academic engagement and thoughtful communication during this practice session. Your ability to think critically and express complex ideas shows real intellectual maturity. Focus on incorporating specific examples from your studies and using strategic pauses to further strengthen your academic presence and confidence in classroom discussions.
        </p>
      </CardContent>
    </Card>
  );
};

export default SessionSummaryCard;