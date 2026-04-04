import { useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles, Heart } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";

import { getContentByCategory, SanctuaryContent } from "@/data/practicesAndSoundscapes";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites } from "@/hooks/useFavorites";
import { useAudioDurations, formatAudioDurationLabel } from "@/hooks/useAudioDuration";
import { cn } from "@/lib/utils";
import { getAuthToken } from '@/services/authTokenService';

const PresenceOutcomePage = () => {
  const navigate = useNavigate();
  const content = getContentByCategory('presence');
  const soundscapes = content.filter(item => item.contentType === 'soundbath');
  const practices = content.filter(item => item.contentType === 'guided-practice');
  const microPractices = content.filter(item => item.contentType === 'micro-practice');
  const [completionCounts, setCompletionCounts] = useState<Record<string, number>>({});
  const { toggleFavorite, isFavorite } = useFavorites();

  // Move specific guided practices to different sections
  const breathingPractices = practices.filter(item => 
    item.id === 'bhramari-pranayama' || item.id === 'trataka-flame-gaze'
  );

  // Hide stoic-reflection from Presence page
  const hiddenPracticeIds = ['stoic-reflection'];
  const filteredMicroPractices = microPractices.filter(item => !hiddenPracticeIds.includes(item.id));

  // Combined items for each section
  const mindsetItems = filteredMicroPractices;
  const somaticItems = [...soundscapes, ...breathingPractices];

  // Load real audio durations for all items with audioSrc
  const allItems = useMemo(() => [...mindsetItems, ...somaticItems], [mindsetItems.length, somaticItems.length]);
  const audioItems = useMemo(() => allItems.filter(i => i.audioSrc).map(i => ({ id: i.id, audioSrc: i.audioSrc })), [allItems]);
  const audioDurations = useAudioDurations(audioItems);

  useEffect(() => {
    const fetchCompletionCounts = async () => {
      try {
        const accessToken = await getAuthToken();
        if (!accessToken) return;
        
        const { data, error } = await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'GET_COMPLETION_COUNTS', category: 'presence' },
        });
        
        if (!error && data?.success && data.data) {
          setCompletionCounts(data.data);
        }
      } catch (err) {
        console.error('[PresenceOutcome] Error fetching completion counts:', err);
      }
    };
    
    fetchCompletionCounts();
  }, []);

  const getOutcomeFocusedTitle = (item: SanctuaryContent): string => {
    // For micro practices, use the title directly as it's already formatted with outcome + origin
    if (item.contentType === 'micro-practice') {
      return item.title;
    }
    
    // For soundscapes and guided practices, use the mapping
    const titleMap: Record<string, string> = {
      "Deep Focus with Monastic Resonance": "Sustained Focus with Monastic Chant",
      "Sustained Focus with Choir Harmonic": "Sustained Focus with Cathedral Choir",
      "Ina Night Fields (Tsukiyomi)": "Nature's Perfect Rhythm",
      "Deep Focus Through Bhramari Pranayama": "Deep Focus Through Bhramari Pranayama",
      "One-Pointed Focus Through Trataka": "One-Pointed Focus Through Trataka",
      "Stoic Evening Reflection": "Daily Virtue Alignment",
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
    
    if (origin.includes("Navy SEAL") || origin.includes("Military") || origin.includes("Special Forces")) {
      return `Based on ${origin}`;
    }
    if (origin.includes("Tibetan") || origin.includes("Ancient") || origin.includes("Traditional") || origin.includes("Vedic") || origin.includes("Buddhist") || origin.includes("Himalayan") || origin.includes("Stoic") || origin.includes("Yoga") || origin.includes("Zen")) {
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

  const formatDuration = (item: SanctuaryContent): string => {
    if (item.audioSrc && audioDurations[item.id]) {
      return formatAudioDurationLabel(audioDurations[item.id]);
    }
    const minutes = item.duration;
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
    const duration = formatDuration(item);
    
    if (count === 0) {
      return duration;
    }
    
    if (item.contentType === 'soundbath') {
      return `${duration} – Listened ${count}x`;
    } else if (item.contentType === 'guided-practice') {
      return `${duration} – Completed ${count}x`;
    } else {
      return `${duration} – Used ${count}x`;
    }
  };

  const handleItemClick = (item: typeof content[0]) => {
    if (item.contentType === 'soundbath') {
      navigate(`/soundscapes/${item.id}`, { state: { category: 'presence' } });
    } else if (item.contentType === 'guided-practice') {
      navigate(`/guided-practices/${item.id}`, { state: { category: 'presence' } });
    } else if (item.contentType === 'micro-practice' && item.steps) {
      // Card-based micro-practices go directly to cards (no intro)
      navigate(`/micro-practice/${item.id}/cards`, { state: { category: 'presence' } });
    } else {
      navigate(`/micro-practice/${item.id}`, { state: { category: 'presence' } });
    }
  };

  const getBadgeLabel = (item: SanctuaryContent): string => {
    if (item.contentType === 'micro-practice') {
      return 'Reframe';
    }
    if (item.contentType === 'soundbath') {
      return 'Soundscape';
    }
    return 'Guided Practice';
  };

  const getSubtitle = (item: SanctuaryContent): string => {
    // Map practice IDs to their outcome-focused subtitles
    const subtitleMap: Record<string, string> = {
      'single-thread-focus': 'Lock attention by choosing one anchor',
      'first-move-momentum': 'Overcome inertia with the smallest possible start',
      'depth-subtraction': 'Achieve clarity by removing, not adding',
      'eternal-now-presence': 'Anchor in this moment, the only one that exists',
      'rhythm-pulse': 'Sustain performance through strategic oscillation',
      'mastery-constraint': 'Accelerate learning by limiting options',
      'wu-wei-flow': 'Flow arises when you align effort with natural conditions',
      'mushin-no-mind': 'Think less, execute more',
      "jobs-simplicity": "Mastery isn't adding complexity–it's ruthless elimination",
      'ikigai-purpose': 'When task meets meaning, energy flows naturally',
      "stoic-reflection": "Review actions, align with virtue at day's end",
    };
    return subtitleMap[item.id] || item.storyHook || '';
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopNavigation backPath="/recalibrate" />
      
      {/* Minimal Header */}
      <div className="relative pt-20 pb-6 px-6 max-w-4xl mx-auto">
        <h1 className="text-[28px] md:text-4xl font-headline font-semibold text-foreground mb-2">
          Flow Mastery
        </h1>
        <p className="text-muted-foreground text-[13px] font-body">Enter deep focus, accelerate productivity, and sustain peak mental performance.</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Mindset Protocol Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-[20px] sm:text-xl font-headline font-medium text-foreground mb-2">Mindset Protocol</h2>
            <p className="text-[13px] text-muted-foreground italic font-body">Cognitive and emotional interventions that frame perspective, build resilience, and prime you for moments that matter</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {mindsetItems.map((item) => (
              <Card key={item.id} className="cursor-pointer group overflow-hidden" onClick={() => handleItemClick(item)}>
                <div className="relative h-36 overflow-hidden">
                  <img 
                    src={item.thumbnail}
                    alt={item.title}
                  className="w-full h-full object-cover img-card img-green-overlay transition-transform duration-300 group-hover:scale-105"
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
                      toggleFavorite(item.id, item.contentType, 'presence');
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
                    {getSubtitle(item)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
            <h2 className="text-[17px] sm:text-xl font-headline text-foreground mb-2">Somatic Protocol</h2>
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
                   className="w-full h-full object-cover img-card img-green-overlay transition-transform duration-300 group-hover:scale-105"
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
                      toggleFavorite(item.id, item.contentType, 'presence');
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
                    {getCredibilitySubtitle(item)}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
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
            <Button variant="outline" onClick={() => navigate('/recalibrate/power-up')}>
              Recharge Mastery →
            </Button>
          </div>
        </div>
      </div>

      
    </div>
  );
};

export default PresenceOutcomePage;