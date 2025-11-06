import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles, TrendingUp } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import MainNavigation from "@/components/MainNavigation";

interface Practice {
  id: string;
  title: string;
  category: "ancient-wisdom" | "high-performer" | "hybrid";
  duration: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  origin: string;
  storySnippet: string;
  usedBy: string;
  thumbnail: string;
  steps: number;
}

const practices: Practice[] = [
  {
    id: "box-breathing",
    title: "Box Breathing Reset",
    category: "high-performer",
    duration: 5,
    difficulty: "beginner",
    origin: "Navy SEAL Tactical Protocol",
    storySnippet: "Before high-stakes missions, Navy SEALs use this 4-4-4-4 breathing pattern to regulate heart rate and sharpen decision-making.",
    usedBy: "Special Forces, Surgeons, Olympic Athletes",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png",
    steps: 4
  },
  {
    id: "tonglen-breathing",
    title: "Tonglen Compassion Practice",
    category: "ancient-wisdom",
    duration: 12,
    difficulty: "intermediate",
    origin: "Buddhist Meditation | Tibet, 9th Century",
    storySnippet: "For 1200 years, Tibetan monks have practiced Tonglen to transform suffering into compassion by breathing in pain and breathing out relief.",
    usedBy: "Backed by Stanford neuroscience",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
    steps: 5
  },
  {
    id: "wim-hof",
    title: "Wim Hof Power Breathing",
    category: "high-performer",
    duration: 15,
    difficulty: "advanced",
    origin: "Cold Exposure Protocol",
    storySnippet: "Dutch extreme athlete Wim Hof developed this technique to control the autonomic nervous system and boost energy.",
    usedBy: "Athletes, Biohackers, Performance Seekers",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png",
    steps: 6
  },
  {
    id: "stoic-reflection",
    title: "Stoic Evening Reflection",
    category: "ancient-wisdom",
    duration: 10,
    difficulty: "beginner",
    origin: "Ancient Rome | Marcus Aurelius",
    storySnippet: "The Roman Emperor's daily practice of reviewing actions, thoughts, and alignment with virtue at day's end.",
    usedBy: "CEOs, Leaders, Philosophers",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png",
    steps: 5
  },
  {
    id: "vipassana-body-scan",
    title: "Vipassana Body Scan",
    category: "ancient-wisdom",
    duration: 20,
    difficulty: "intermediate",
    origin: "Buddhist Mindfulness | 2500 years",
    storySnippet: "Ancient technique of systematically observing bodily sensations to develop equanimity and insight.",
    usedBy: "Meditators, Mindfulness Practitioners",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png",
    steps: 8
  },
  {
    id: "pre-performance-ritual",
    title: "Pre-Performance Ritual",
    category: "hybrid",
    duration: 8,
    difficulty: "intermediate",
    origin: "Olympic Swimmer Protocol",
    storySnippet: "Combines ancient visualization with modern sports psychology to create peak performance state before competition.",
    usedBy: "Olympic Swimmers, Performers",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
    steps: 6
  }
];

const GuidedPracticesLibrary = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");

  const filteredPractices = practices.filter(p => {
    const categoryMatch = selectedCategory === "all" || p.category === selectedCategory;
    const difficultyMatch = selectedDifficulty === "all" || p.difficulty === selectedDifficulty;
    return categoryMatch && difficultyMatch;
  });

  const getCategoryColor = (category: string) => {
    switch(category) {
      case "ancient-wisdom": return "bg-forest/10 text-forest border-forest/30";
      case "high-performer": return "bg-accent/10 text-accent border-accent/30";
      case "hybrid": return "bg-primary/10 text-primary border-primary/30";
      default: return "";
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch(difficulty) {
      case "beginner": return "text-green-600";
      case "intermediate": return "text-yellow-600";
      case "advanced": return "text-red-600";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <UnifiedTopBar backPath="/recalibrate" />
      
      {/* Hero Banner */}
      <div 
        className="relative h-64 bg-cover bg-center mt-14"
        style={{ backgroundImage: `url('/lovable-uploads/4ed33e6d-77b9-47f9-9981-bab218507307.png')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-mocha/60 via-mocha/40 to-background" />
        <div className="relative h-full flex flex-col justify-center px-6 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
            Guided Practices
          </h1>
          <p className="text-cream/80 text-lg">Step-by-step journeys from ancient wisdom and modern performance science</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="space-y-4 mb-8">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Category</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedCategory === "all" ? "default" : "outline"}
                onClick={() => setSelectedCategory("all")}
                className="rounded-full"
                size="sm"
              >
                All
              </Button>
              <Button
                variant={selectedCategory === "ancient-wisdom" ? "default" : "outline"}
                onClick={() => setSelectedCategory("ancient-wisdom")}
                className="rounded-full"
                size="sm"
              >
                Ancient Wisdom
              </Button>
              <Button
                variant={selectedCategory === "high-performer" ? "default" : "outline"}
                onClick={() => setSelectedCategory("high-performer")}
                className="rounded-full"
                size="sm"
              >
                High Performer
              </Button>
              <Button
                variant={selectedCategory === "hybrid" ? "default" : "outline"}
                onClick={() => setSelectedCategory("hybrid")}
                className="rounded-full"
                size="sm"
              >
                Hybrid
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">Difficulty</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={selectedDifficulty === "all" ? "default" : "outline"}
                onClick={() => setSelectedDifficulty("all")}
                className="rounded-full"
                size="sm"
              >
                All Levels
              </Button>
              <Button
                variant={selectedDifficulty === "beginner" ? "default" : "outline"}
                onClick={() => setSelectedDifficulty("beginner")}
                className="rounded-full"
                size="sm"
              >
                Beginner
              </Button>
              <Button
                variant={selectedDifficulty === "intermediate" ? "default" : "outline"}
                onClick={() => setSelectedDifficulty("intermediate")}
                className="rounded-full"
                size="sm"
              >
                Intermediate
              </Button>
              <Button
                variant={selectedDifficulty === "advanced" ? "default" : "outline"}
                onClick={() => setSelectedDifficulty("advanced")}
                className="rounded-full"
                size="sm"
              >
                Advanced
              </Button>
            </div>
          </div>
        </div>

        {/* Practices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPractices.map((practice) => (
            <Card
              key={practice.id}
              className="cursor-pointer group overflow-hidden"
              onClick={() => navigate(`/guided-practices/${practice.id}`)}
            >
              <div 
                className="h-48 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url('${practice.thumbnail}')` }}
              >
                <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 flex items-end p-4 justify-between">
                  <Badge className={getCategoryColor(practice.category)}>
                    {practice.category.replace("-", " ")}
                  </Badge>
                  <span className={`text-xs font-semibold ${getDifficultyColor(practice.difficulty)}`}>
                    {practice.difficulty.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{practice.title}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-gold/80">
                  <Sparkles className="h-3 w-3" />
                  <span className="text-xs">{practice.origin}</span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {practice.storySnippet}
                </p>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-[10px]">{practice.usedBy}</span>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">{practice.duration}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70">
                    {practice.steps} steps
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default GuidedPracticesLibrary;
