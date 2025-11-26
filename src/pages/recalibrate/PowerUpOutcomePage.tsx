import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles, Heart } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import { getContentByCategory, SanctuaryContent } from "@/data/practicesAndSoundscapes";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

const PowerUpOutcomePage = () => {
  const navigate = useNavigate();
  const content = getContentByCategory('power-up');
  const soundscapes = content.filter(item => item.contentType === 'soundbath');
  const practices = content.filter(item => item.contentType === 'guided-practice');
  const allMicroPractices = content.filter(item => item.contentType === 'micro-practice');
  const [completionCounts, setCompletionCounts] = useState<Record<string, number>>({});
  const { toggleFavorite, isFavorite } = useFavorites();

  // Move breathing practices to Somatic Protocol
  const breathingPractices = practices.filter(item => 
    item.id === 'kapalabhati-pranayama' || item.id === 'box-breathing'
  );

  // Move kinesthetic movement micro-practice to Somatic Protocol
  const somaticMicroPractices = allMicroPractices.filter(item => item.id === 'energy-shift');
  const microPractices = allMicroPractices.filter(item => item.id !== 'energy-shift');

  // Combined items for Somatic Protocol (soundscapes + breathing practices + kinesthetic movement)
  const somaticItems = [...soundscapes, ...breathingPractices, ...somaticMicroPractices];

  useEffect(() => {
    const fetchCompletionCounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      
      const { data, error } = await supabase
        .from('sanctuary_events')
        .select('content_id')
        .eq('user_id', user.id)
        .eq('event_type', 'completed');
      
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach(event => {
          counts[event.content_id] = (counts[event.content_id] || 0) + 1;
        });
        setCompletionCounts(counts);
      }
    };
    
    fetchCompletionCounts();
  }, []);

  const getOutcomeFocusedTitle = (item: SanctuaryContent): string => {
    // For card-based micro practices, use the card title
    if (item.id === 'buddhist-phoenix') {
      return 'Resilience Through The Phoenix';
    }
    if (item.id === 'energy-through-reframe') {
      return 'Energy Through Reframe';
    }
    if (item.id === 'courage-future-self') {
      return 'Courage Through The Future Self';
    }
    if (item.id === 'confidence-through-evidence') {
      return 'Confidence & Readiness Through Evidence';
    }
    if (item.id === 'energy-through-completion') {
      return 'Restore Energy Through Completion';
    }
    if (item.id === 'courage-arena') {
      return 'Resilience Through Brave Action';
    }
    
    // For other micro practices, use the title directly
    if (item.contentType === 'micro-practice') {
      return item.title;
    }
    
    // For soundscapes and guided practices, use the mapping
    const titleMap: Record<string, string> = {
      "Athletic Activation": "Pre-Competition Mental Preparation",
      "Kapalabhati Pranayama": "Energy Surge Through Kapalabhati",
      "The Spartan Battle Breath": "Access Fearless Warrior State",
      "Box Breathing Reset": "Tactical Composure Through Box Breathing",
      "Wim Hof Power Breathing": "Control Your Autonomic System",
    };
    return titleMap[item.title] || item.title;
  };

  const getCredibilitySubtitle = (item: SanctuaryContent): string => {
    if (!item.origin && !item.creator) return "";
    
    // For micro practices with creator field, prioritize that
    if (item.contentType === 'micro-practice' && item.creator) {
      return item.creator;
    }
    
    const origin = item.origin || "";
    const creator = item.creator || "";
    
    if (origin.includes("Navy SEAL") || origin.includes("Military") || origin.includes("Special Forces") || origin.includes("Spartan")) {
      return `Based on ${origin}`;
    }
    if (origin.includes("Tibetan") || origin.includes("Ancient") || origin.includes("Traditional") || origin.includes("Vedic") || origin.includes("Buddhist") || origin.includes("Himalayan") || origin.includes("Yoga")) {
      return `Drawn from ${origin}`;
    }
    if (origin.includes("Olympic") || origin.includes("Sports") || origin.includes("Athletic")) {
      return `Based on ${origin}`;
    }
    if (creator && !origin) {
      return `Inspired by ${creator}`;
    }
    
    return `Drawn from ${origin || creator}`;
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) {
      return `${minutes * 60} sec`;
    } else if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours} hr ${mins} mins` : `${hours} hr`;
    } else {
      return `${minutes} mins`;
    }
  };

  const getTechniqueTease = (technique: string | undefined): string => {
    if (!technique) return "";
    const sentences = technique.split('. ');
    return sentences[0] + '.';
  };

  const getCompletionTracking = (item: SanctuaryContent): string => {
    const count = completionCounts[item.id] || 0;
    const duration = formatDuration(item.duration);
    
    if (count === 0) {
      return duration;
    }
    
    if (item.contentType === 'soundbath') {
      return `${duration} — Listened ${count}x`;
    } else if (item.contentType === 'guided-practice') {
      return `${duration} — Completed ${count}x`;
    } else {
      return `${duration} — Used ${count}x`;
    }
  };

  const handleItemClick = (item: typeof content[0]) => {
    if (item.contentType === 'soundbath') {
      navigate(`/soundscapes/${item.id}`, { state: { category: 'power-up' } });
    } else if (item.contentType === 'guided-practice') {
      navigate(`/guided-practices/${item.id}`, { state: { category: 'power-up' } });
    } else if (item.contentType === 'micro-practice' && item.steps) {
      // Card-based micro-practices go directly to cards (no intro)
      navigate(`/micro-practice/${item.id}/cards`, { state: { category: 'power-up' } });
    } else {
      navigate(`/micro-practice/${item.id}`, { state: { category: 'power-up' } });
    }
  };

  const getBadgeLabel = (item: SanctuaryContent): string => {
    if (item.contentType === 'micro-practice') {
      // All micro-practices under Mindset Protocol should show "Reframe"
      return 'Reframe';
    }
    if (item.contentType === 'soundbath') {
      return 'Soundscape';
    }
    if (item.contentType === 'guided-practice') {
      return 'Guided Practice';
    }
    return 'Practice';
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopNavigation backPath="/recalibrate" />
      
      {/* Minimal Header */}
      <div className="relative pt-20 pb-6 px-6 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-headline font-semibold text-foreground mb-2">
          Renewal Mastery
        </h1>
        <p className="text-muted-foreground text-base font-body">Rebuild energy, resilience, and readiness for high-stakes moments.</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Mindset Protocol Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-2xl font-headline text-foreground mb-2">Mindset Protocol</h2>
            <p className="text-sm text-muted-foreground italic">Cognitive and emotional interventions that frame perspective, build resilience, and prime you for moments that matter</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {microPractices.map((item) => (
              <Card key={item.id} className="cursor-pointer group overflow-hidden" onClick={() => handleItemClick(item)}>
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover img-card img-taupe-overlay transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-background/50 text-foreground border-border">
                      {getBadgeLabel(item)}
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id, item.contentType, 'power-up');
                    }}
                    className="absolute top-4 right-4 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5 transition-colors",
                        isFavorite(item.id) ? "fill-primary text-primary" : "text-muted-foreground"
                      )}
                    />
                  </button>
                </div>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{getOutcomeFocusedTitle(item)}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    {item.id === 'buddhist-phoenix' 
                      ? 'Reframe setbacks into strength and clarity' 
                      : item.id === 'energy-through-reframe'
                        ? 'Rapid activation when energy runs low'
                        : item.id === 'courage-future-self'
                          ? 'Act with courage to choose growth over comfort in key moments that matter'
                          : item.id === 'confidence-through-evidence'
                            ? 'Rebuild self-belief with your own proof'
                            : item.id === 'courage-arena'
                              ? 'Step into visibility knowing you might fail — and choose to show up anyway'
                              : item.storyHook}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{getTechniqueTease(item.technique)}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{getCompletionTracking(item)}</span>
                    </div>
                    {item.steps && <span className="text-[10px] text-muted-foreground/70">{item.steps} steps</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Somatic Protocol Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-2xl font-headline text-foreground mb-2">Somatic Protocol</h2>
            <p className="text-sm text-muted-foreground italic">Body-centered interventions to regulate your nervous system, align energy, and prepare your body</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {somaticItems.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer group overflow-hidden"
                onClick={() => handleItemClick(item)}
              >
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover img-card img-taupe-overlay transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-background/50 text-foreground border-border">
                      {getBadgeLabel(item)}
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id, item.contentType, 'power-up');
                    }}
                    className="absolute top-4 right-4 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
                  >
                    <Heart
                      className={cn(
                        "h-5 w-5 transition-colors",
                        isFavorite(item.id) ? "fill-primary text-primary" : "text-muted-foreground"
                      )}
                    />
                  </button>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{getOutcomeFocusedTitle(item)}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    {item.storyHook}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {getTechniqueTease(item.technique)}
                  </p>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{getCompletionTracking(item)}</span>
                    </div>
                    {item.steps && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {item.steps} steps
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Explore Other Outcomes */}
        <div className="mt-16 text-center">
          <div className="h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mb-8" />
          <p className="text-muted-foreground mb-4">Looking for something else?</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button variant="outline" onClick={() => navigate('/recalibrate/pause')}>
              Pause Mastery →
            </Button>
            <Button variant="outline" onClick={() => navigate('/recalibrate/presence')}>
              Flow Mastery →
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PowerUpOutcomePage;