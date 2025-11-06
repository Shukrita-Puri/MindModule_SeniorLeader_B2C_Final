import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import MainNavigation from "@/components/MainNavigation";
import PrivacyFooter from "@/components/home/PrivacyFooter";

interface Soundscape {
  id: string;
  title: string;
  category: "power-up" | "pause" | "presence";
  duration: number;
  origin: string;
  storyHook: string;
  creator: string;
  thumbnail: string;
}

const soundscapes: Soundscape[] = [
  {
    id: "tibetan-bowls",
    title: "Tibetan Bowl Resonance",
    category: "presence",
    duration: 8,
    origin: "Ancient Himalayan Tradition",
    storyHook: "5000-year practice used by monks to achieve deep meditative states through harmonic frequencies.",
    creator: "Curated from Tibetan Buddhist lineages",
    thumbnail: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png"
  },
  {
    id: "gamma-frequency",
    title: "40Hz Gamma Focus",
    category: "power-up",
    duration: 12,
    origin: "MIT Neuroscience Protocol",
    storyHook: "Researched at MIT's McGovern Institute to enhance cognitive performance and mental clarity.",
    creator: "Based on neuroscience research",
    thumbnail: "/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png"
  },
  {
    id: "navy-seal-calm",
    title: "Pre-Mission Calm",
    category: "pause",
    duration: 5,
    origin: "Navy SEAL Protocol",
    storyHook: "Used by special forces before high-stakes operations to achieve tactical composure.",
    creator: "Military performance protocol",
    thumbnail: "/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png"
  },
  {
    id: "forest-bathing",
    title: "Forest Bathing",
    category: "presence",
    duration: 15,
    origin: "Japanese Shinrin-yoku",
    storyHook: "Proven by Tokyo researchers to lower cortisol and boost immune function through nature immersion.",
    creator: "Traditional Japanese practice",
    thumbnail: "/lovable-uploads/afddfc0a-07c8-4659-bfb5-560d510b12c3.png"
  },
  {
    id: "athlete-activation",
    title: "Athletic Activation",
    category: "power-up",
    duration: 6,
    origin: "Olympic Performance Protocol",
    storyHook: "Used by Olympic swimmers and track athletes for pre-competition mental preparation.",
    creator: "Sports psychology protocol",
    thumbnail: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png"
  },
  {
    id: "vedic-om",
    title: "Vedic Om Chanting",
    category: "presence",
    duration: 10,
    origin: "Ancient Indian Tradition",
    storyHook: "3000-year Vedic practice that synchronizes breath, sound, and consciousness.",
    creator: "Traditional Vedic lineage",
    thumbnail: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png"
  }
];

const Soundscapes = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredSoundscapes = selectedCategory === "all" 
    ? soundscapes 
    : soundscapes.filter(s => s.category === selectedCategory);

  const getCategoryColor = (category: string) => {
    switch(category) {
      case "power-up": return "bg-accent/10 text-accent border-accent/30";
      case "pause": return "bg-primary/10 text-primary border-primary/30";
      case "presence": return "bg-forest/10 text-forest border-forest/30";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <UnifiedTopBar backPath="/recalibrate" />
      
      {/* Hero Banner */}
      <div 
        className="relative h-64 bg-cover bg-center mt-14"
        style={{ backgroundImage: `url('/lovable-uploads/06444f60-b3bd-4d38-a749-aea185d789e6.png')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-mocha/60 via-mocha/40 to-background" />
        <div className="relative h-full flex flex-col justify-center px-6 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
            Soundscape Library
          </h1>
          <p className="text-cream/80 text-lg">Curated sonic experiences from ancient wisdom and modern science</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Category Filter */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <Button
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
            className="rounded-full"
          >
            All Soundscapes
          </Button>
          <Button
            variant={selectedCategory === "power-up" ? "default" : "outline"}
            onClick={() => setSelectedCategory("power-up")}
            className="rounded-full"
          >
            Power Up
          </Button>
          <Button
            variant={selectedCategory === "pause" ? "default" : "outline"}
            onClick={() => setSelectedCategory("pause")}
            className="rounded-full"
          >
            Pause
          </Button>
          <Button
            variant={selectedCategory === "presence" ? "default" : "outline"}
            onClick={() => setSelectedCategory("presence")}
            className="rounded-full"
          >
            Presence
          </Button>
        </div>

        {/* Soundscape Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredSoundscapes.map((soundscape) => (
            <Card
              key={soundscape.id}
              className="cursor-pointer group overflow-hidden"
              onClick={() => navigate(`/soundscapes/${soundscape.id}`)}
            >
              <div 
                className="h-48 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url('${soundscape.thumbnail}')` }}
              >
                <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 flex items-end p-4">
                  <Badge className={getCategoryColor(soundscape.category)}>
                    {soundscape.category}
                  </Badge>
                </div>
              </div>
              
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{soundscape.title}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-gold/80">
                  <Sparkles className="h-3 w-3" />
                  <span className="text-xs">{soundscape.origin}</span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {soundscape.storyHook}
                </p>
                
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">{soundscape.duration}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 text-right italic max-w-[50%] leading-tight">
                    {soundscape.creator}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default Soundscapes;
