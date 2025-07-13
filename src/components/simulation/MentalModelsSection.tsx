import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MentalModelsSection = () => {
  const mentalModels = [
    {
      title: "Growth Mindset Framework",
      type: "Learning Approach",
      description: "View challenges as opportunities to develop your abilities",
      application: "When facing difficult situations, ask 'What can I learn from this?'"
    },
    {
      title: "STOP Technique",
      type: "Stress Management",
      description: "Stop, Take a breath, Observe, Proceed with awareness",
      application: "Use before big conversations, tests, or when feeling overwhelmed"
    },
    {
      title: "The Confidence Paradox",
      type: "Student Wisdom",
      description: "True confidence comes from embracing what you don't know yet",
      application: "It's okay to say 'I don't know, but here's how I'd approach it'"
    },
    {
      title: "The Middle Way",
      type: "Buddhist Wisdom",
      description: "Balance between extremes leads to wise decision-making",
      application: "When facing difficult choices, avoid all-or-nothing thinking and seek the balanced path"
    },
    {
      title: "Memento Mori",
      type: "Stoic Philosophy",
      description: "Remembering mortality helps focus on what truly matters",
      application: "Before stressing about small things, ask 'Will this matter in 10 years?'"
    },
    {
      title: "Beginner's Mind (Shoshin)",
      type: "Zen Teaching",
      description: "Approach challenges with fresh perspective and openness",
      application: "In new situations, embrace curiosity over assumption and wonder over judgment"
    },
    {
      title: "Ubuntu Philosophy",
      type: "African Wisdom",
      description: "'I am because we are' - recognizing our interconnectedness",
      application: "Remember that your success is connected to others' wellbeing and growth"
    },
    {
      title: "Wu Wei",
      type: "Taoist Teaching",
      description: "Effortless action through understanding natural flow",
      application: "When feeling forced or struggling, step back and find the path of least resistance"
    }
  ];

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl font-heading text-foreground">Recommended Mental Models</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mentalModels.map((model, index) => (
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