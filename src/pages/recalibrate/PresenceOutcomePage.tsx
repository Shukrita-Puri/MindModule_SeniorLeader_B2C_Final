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
          <h2 className="text-3xl font-serif text-foreground mb-6 flex items-center gap-2">
            <span>Focus Soundscapes</span>
            <Badge variant="outline" className="text-xs">{soundscapes.length} soundscapes</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                
                <CardHeader>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 text-gold">
                    <Sparkles className="h-4 w-4" />
                    {item.origin}
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {item.storyHook}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{item.duration}</span>
                    </div>
                    {item.creator && (
                      <span className="text-xs text-muted-foreground italic">
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
          <h2 className="text-3xl font-serif text-foreground mb-6 flex items-center gap-2">
            <span>Mindful Presence</span>
            <Badge variant="outline" className="text-xs">{practices.length} practices</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                
                <CardHeader>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 text-gold">
                    <Sparkles className="h-4 w-4" />
                    {item.origin}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.storyHook}
                  </p>
                  
                  {item.usedBy && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>{item.usedBy}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{item.duration}</span>
                    </div>
                    {item.steps && (
                      <span className="text-xs text-muted-foreground">
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