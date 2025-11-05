import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Sparkles, TrendingUp } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import MainNavigation from "@/components/MainNavigation";
import { getContentByCategory } from "@/data/practicesAndSoundscapes";

const PresenceOutcomePage = () => {
  const navigate = useNavigate();
  const content = getContentByCategory('presence');
  const soundscapes = content.filter(item => item.type === 'soundscape');
  const practices = content.filter(item => item.type === 'practice');

  const handleItemClick = (item: typeof content[0]) => {
    if (item.type === 'soundscape') {
      navigate(`/soundscapes/${item.id}`, { state: { category: 'presence' } });
    } else {
      navigate(`/guided-practices/${item.id}`, { state: { category: 'presence' } });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <GlobalHeader />
      
      {/* Hero Banner */}
      <div 
        className="relative h-64 bg-cover bg-center"
        style={{ backgroundImage: `url('/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-mocha/60 via-mocha/40 to-background" />
        <div className="relative h-full flex flex-col justify-center px-6 max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/recalibrate')}
            className="absolute top-4 left-4 text-cream hover:text-gold"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-5xl md:text-6xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
            Presence: Deep Focus & Flow
          </h1>
          <p className="text-cream/80 text-lg">Extended focus sessions and mindfulness practices for sustained attention and peak performance</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Soundscapes Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-serif text-foreground mb-6 flex items-center gap-2">
            <span>Focus Soundscapes</span>
            <Badge variant="outline" className="text-xs">{soundscapes.length} soundscapes</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {soundscapes.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer group overflow-hidden"
                onClick={() => handleItemClick(item)}
              >
                <div 
                  className="h-48 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                  style={{ backgroundImage: `url('${item.thumbnail}')` }}
                >
                  <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 flex items-end p-4">
                    <Badge className="bg-forest/10 text-forest border-forest/30">
                      Soundscape
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {item.subtitle}
                  </CardDescription>
                  <div className="flex items-center gap-2 text-xs text-gold/80">
                    <Sparkles className="h-3 w-3" />
                    {item.origin}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.storyHook}
                  </p>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">{item.duration}</span>
                </div>
                    {item.creator && (
                      <span className="text-[10px] text-muted-foreground/70 text-right italic max-w-[50%] leading-tight">
                        {item.creator}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Guided Practices Section */}
        <section>
          <h2 className="text-2xl font-serif text-foreground mb-6 flex items-center gap-2">
            <span>Mindful Presence</span>
            <Badge variant="outline" className="text-xs">{practices.length} practices</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {practices.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer group overflow-hidden"
                onClick={() => handleItemClick(item)}
              >
                <div 
                  className="h-48 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                  style={{ backgroundImage: `url('${item.thumbnail}')` }}
                >
                  <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 flex items-end p-4">
                    <Badge className="bg-forest/10 text-forest border-forest/30">
                      Practice
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {item.subtitle}
                  </CardDescription>
                  <div className="flex items-center gap-2 text-xs text-gold/80">
                    <Sparkles className="h-3 w-3" />
                    {item.origin}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.storyHook}
                  </p>
                  
                  {item.usedBy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-[10px]">{item.usedBy}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">{item.duration}</span>
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
              Need Reset? Try Pause →
            </Button>
            <Button variant="outline" onClick={() => navigate('/recalibrate/power-up')}>
              Need Energy? Try Power Up →
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PresenceOutcomePage;