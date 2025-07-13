import { Card, CardContent } from "@/components/ui/card";

const WisdomSection = () => {
  const ancientWisdomCollection = [
    {
      text: "Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth.",
      source: "Viktor Frankl, inspired by Stoic wisdom",
      icon: "🏺",
      theme: "Student Growth"
    },
    {
      text: "The best time to plant a tree was 20 years ago. The second best time is now.",
      source: "Chinese Proverb",
      icon: "🌱",
      theme: "Taking Action"
    },
    {
      text: "You have power over your mind—not outside events. Realize this, and you will find strength.",
      source: "Marcus Aurelius, Meditations",
      icon: "⚡",
      theme: "Inner Strength"
    },
    {
      text: "In the beginner's mind there are many possibilities, but in the expert's mind there are few.",
      source: "Shunryu Suzuki, Zen Mind, Beginner's Mind",
      icon: "🎋",
      theme: "Learning Mindset"
    },
    {
      text: "If you want to go fast, go alone. If you want to go far, go together.",
      source: "African Proverb",
      icon: "🤝",
      theme: "Community & Growth"
    },
    {
      text: "The obstacle is the path.",
      source: "Zen Teaching",
      icon: "🗻",
      theme: "Resilience"
    }
  ];

  // Rotate wisdom based on time or could be random
  const currentWisdom = ancientWisdomCollection[Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % ancientWisdomCollection.length];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-6">
        <div className="text-center">
          <div className="text-3xl mb-4">{currentWisdom.icon}</div>
          <blockquote className="text-lg font-heading italic text-foreground mb-4 leading-relaxed">
            "{currentWisdom.text}"
          </blockquote>
          <div className="text-sm text-muted-foreground mb-2">— {currentWisdom.source}</div>
          <div className="text-xs text-primary font-medium">{currentWisdom.theme}</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WisdomSection;