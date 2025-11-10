import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";
import MainNavigation from "@/components/MainNavigation";
import { getContentByCategory, SanctuaryContent } from "@/data/practicesAndSoundscapes";
import { supabase } from "@/integrations/supabase/client";

const PauseOutcomePage = () => {
  const navigate = useNavigate();
  const content = getContentByCategory('pause');
  const soundscapes = content.filter(item => item.contentType === 'soundbath');
  const practices = content.filter(item => item.contentType === 'guided-practice');
  const microPractices = content.filter(item => item.contentType === 'micro-practice');
  const [completionCounts, setCompletionCounts] = useState<Record<string, number>>({});

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
    const titleMap: Record<string, string> = {
      "Tibetan Bowl Resonance": "Deep Meditative Flow",
      "Pre-Mission Calm": "Tactical Composure Before Critical Moments",
      "Forest Bathing": "Natural Stress Relief & Immune Boost",
      "Himalayan Mountain Monastery": "Sacred Devotional Calm",
      "Cathedral Choir Flow": "Resonant Focus & Healing",
      "Earth Resonance": "Grounded Nervous System Reset",
      "Tonglen Compassion Practice": "Transform Suffering Into Compassion",
      "Vipassana Body Scan": "Body Awareness & Equanimity",
      "Tactical Pause": "60-Second Nervous System Reset",
      "Grounding Touch": "Instant Anxiety Relief",
    };
    return titleMap[item.title] || item.title;
  };

  const getCredibilitySubtitle = (item: SanctuaryContent): string => {
    if (!item.origin && !item.creator) return "";
    
    const origin = item.origin || "";
    const creator = item.creator || "";
    
    if (origin.includes("Navy SEAL") || origin.includes("Military") || origin.includes("Special Forces")) {
      return `Based on ${origin}`;
    }
    if (origin.includes("Tibetan") || origin.includes("Ancient") || origin.includes("Traditional") || origin.includes("Vedic") || origin.includes("Buddhist") || origin.includes("Himalayan")) {
      return `Drawn from ${origin}`;
    }
    if (origin.includes("Olympic") || origin.includes("Sports")) {
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
      navigate(`/soundscapes/${item.id}`, { state: { category: 'pause' } });
    } else if (item.contentType === 'guided-practice') {
      navigate(`/guided-practices/${item.id}`, { state: { category: 'pause' } });
    } else {
      navigate(`/micro-practice/${item.id}`, { state: { category: 'pause' } });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopNavigation backPath="/recalibrate" />
      
      {/* Minimal Header */}
      <div className="relative pt-20 pb-6 px-6 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-headline font-semibold text-foreground mb-2">
          Pause Mastery
        </h1>
        <p className="text-muted-foreground text-base font-body">Reset and restore composure, regain clarity, and maintain executive poise, in moments of intensity.</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Soundscapes Section */}
        <section className="mb-12">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-headline text-foreground">Sonic Studio</h2>
              <Badge variant="outline" className="text-xs">6 Soundscapes</Badge>
            </div>
            <p className="text-sm text-muted-foreground italic">immersive audio experiences curated from timeless wisdom and practices proven by high performers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {soundscapes.map((item) => (
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
                      Soundscape
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{getOutcomeFocusedTitle(item)}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    {getCredibilitySubtitle(item)}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.storyHook}
                  </p>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{getCompletionTracking(item)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Guided Sessions Section */}
        <section className="mb-12">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-headline text-foreground">Guided Sessions</h2>
              <Badge variant="outline" className="text-xs">2 Practices</Badge>
            </div>
            <p className="text-sm text-muted-foreground italic">intentional exercises drawn from ancient traditions and elite performance protocols</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {practices.map((item) => (
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
                      Practice
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{getOutcomeFocusedTitle(item)}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    {getCredibilitySubtitle(item)}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.storyHook}
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

        {/* Micro Exercises Section */}
        <section className="mb-12">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-headline text-foreground">Micro Exercises</h2>
              <Badge variant="outline" className="text-xs">2 Tools</Badge>
            </div>
            <p className="text-sm text-muted-foreground italic">quick, high-impact interventions designed for moments that matter</p>
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
                    <Badge className="bg-background/50 text-foreground border-border">Tool</Badge>
                  </div>
                </div>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{getOutcomeFocusedTitle(item)}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    {getCredibilitySubtitle(item)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.storyHook}</p>
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

        {/* Explore Other Outcomes */}
        <div className="mt-16 text-center">
          <div className="h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mb-8" />
          <p className="text-muted-foreground mb-4">Looking for something else?</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button variant="outline" onClick={() => navigate('/recalibrate/presence')}>
              Flow Mastery →
            </Button>
            <Button variant="outline" onClick={() => navigate('/recalibrate/power-up')}>
              Renewal Mastery →
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PauseOutcomePage;
