import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MentalModelsSection = () => {
  const topMentalModels = [
    {
      title: "Growth Mindset Framework",
      type: "Modern Framework",
      description: "View challenges as opportunities to develop your abilities",
      application: "When facing difficult situations, ask 'What can I learn from this?'"
    },
    {
      title: "The Middle Way",
      type: "Ancient Wisdom",
      description: "Balance between extremes leads to wise decision-making",
      application: "When facing difficult choices, avoid all-or-nothing thinking and seek the balanced path"
    },
    {
      title: "STOP Technique",
      type: "Modern Framework",
      description: "Stop, Take a breath, Observe, Proceed with awareness",
      application: "Use before big conversations, tests, or when feeling overwhelmed"
    }
  ];

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl font-heading text-foreground">Recommended Mental Models</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {topMentalModels.map((model, index) => (
            <div key={index} className="bg-background border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-heading font-medium text-foreground">{model.title}</h4>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                  {model.type}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3 font-body">
                {model.description}
              </p>
              <div className="text-xs text-foreground font-body">
                <strong>Application:</strong> {model.application}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default MentalModelsSection;