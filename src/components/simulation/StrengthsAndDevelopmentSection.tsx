import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const StrengthsAndDevelopmentSection = () => {
  const strengths = [
    "Maintained composure during challenging academic discussions",
    "Articulated complex ideas clearly and logically",
    "Showed active listening skills when engaging with professors/peers",
    "Demonstrated curiosity and willingness to explore difficult topics"
  ];

  const developmentAreas = [
    "Practice the 'pause-and-think' technique before answering in class",
    "Use concrete examples from coursework to support your points",
    "Don't hesitate to say 'Let me think about that' when you need a moment",
    "Reference your readings and research to build academic credibility"
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Communication Strengths */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl font-heading text-foreground">Communication Strengths</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {strengths.map((strength, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-foreground font-body text-sm leading-relaxed">{strength}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Development Opportunities */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl font-heading text-foreground">Development Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {developmentAreas.map((area, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-foreground font-body text-sm leading-relaxed">{area}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StrengthsAndDevelopmentSection;