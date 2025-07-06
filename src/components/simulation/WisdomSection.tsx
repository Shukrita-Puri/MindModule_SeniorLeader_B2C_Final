import { Card, CardContent } from "@/components/ui/card";

const WisdomSection = () => {
  const ancientWisdom = "Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth.";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-6">
        <div className="text-center">
          <div className="text-3xl mb-4">🏺</div>
          <blockquote className="text-lg font-heading italic text-foreground mb-4 leading-relaxed">
            "{ancientWisdom}"
          </blockquote>
          <div className="text-sm text-muted-foreground">Wisdom for Student Growth</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WisdomSection;