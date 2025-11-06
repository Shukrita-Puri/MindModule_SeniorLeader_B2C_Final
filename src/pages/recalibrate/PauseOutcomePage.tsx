import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Sparkles, TrendingUp } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import MainNavigation from "@/components/MainNavigation";
import { getContentByCategory } from "@/data/practicesAndSoundscapes";

const PauseOutcomePage = () => {
  const navigate = useNavigate();
  const content = getContentByCategory('pause');
  const soundscapes = content.filter(item => item.contentType === 'soundbath');
  const practices = content.filter(item => item.contentType === 'guided-practice');
  const microPractices = content.filter(item => item.contentType === 'micro-practice');

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
      <GlobalHeader />
      
      {/* Hero Banner */}
      <div className="relative h-64 overflow-hidden">
        <img 
          src="/lovable-uploads/aa4d150b-e5fe-48d7-aa74-9f082d21ffaa.png"
          alt="Pause"
          className="absolute inset-0 w-full h-full object-cover img-hero"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background" />
        <div className="relative h-full flex flex-col justify-center px-6 max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/recalibrate')}
            className="absolute top-4 left-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-4xl md:text-5xl font-headline font-semibold text-foreground mb-2">
            Pause
          </h1>
          <p className="text-muted-foreground text-base font-body">Reset and restore through breathing and calming sounds</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Soundscapes Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline text-foreground mb-6 flex items-center gap-2">
            <span>Sonic Restoration</span>
            <Badge variant="outline" className="text-xs">{soundscapes.length} soundscapes</Badge>
          </h2>
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
                    className="w-full h-full object-cover img-card transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-background/50 text-foreground border-border">
                      Soundscape
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {item.creator}
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
          <h2 className="text-2xl font-headline text-foreground mb-6 flex items-center gap-2">
            <span>Structured Reset</span>
            <Badge variant="outline" className="text-xs">{practices.length} practices</Badge>
          </h2>
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
                    className="w-full h-full object-cover img-card transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-background/50 text-foreground border-border">
                      Practice
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {item.creator}
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

        {/* Micro Practices Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline text-foreground mb-6 flex items-center gap-2">
            <span>Quick Reset Tools</span>
            <Badge variant="outline" className="text-xs">{microPractices.length} practices</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {microPractices.map((item) => (
              <Card key={item.id} className="cursor-pointer group overflow-hidden" onClick={() => handleItemClick(item)}>
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover img-card transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card/60" />
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-background/50 text-foreground border-border">Micro</Badge>
                  </div>
                </div>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">{item.creator}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.storyHook}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs">{item.duration} min</span>
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
            <Button variant="outline" onClick={() => navigate('/recalibrate/power-up')}>
              Need Energy? Try Power Up →
            </Button>
            <Button variant="outline" onClick={() => navigate('/recalibrate/presence')}>
              Need Focus? Try Presence →
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PauseOutcomePage;