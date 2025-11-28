import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import MainNavigation from "@/components/MainNavigation";
import { useContentByType } from "@/hooks/useContent";

const MicroPracticesLibrary = () => {
  const navigate = useNavigate();
  const { data: microPractices = [], isLoading } = useContentByType('micro-practice');

  const handlePracticeClick = (id: string, category: string) => {
    navigate(`/micro-practice/${id}`, { state: { category } });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <UnifiedTopBar backPath="/recalibrate" />
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Loading practices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <UnifiedTopBar backPath="/recalibrate" />
      
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-mocha via-mocha/60 to-background border-b border-gold/20 py-12 mt-14">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
            Micro Practices
          </h1>
          <p className="text-cream/80 text-lg">
            1-3 minute resets for immediate energy shifts
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Badge variant="outline" className="text-xs">{microPractices.length} practices</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Micro Practices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {microPractices.map((practice) => (
            <Card
              key={practice.id}
              className="cursor-pointer group overflow-hidden hover:shadow-lg transition-all"
              onClick={() => handlePracticeClick(practice.id, practice.category)}
            >
              <div 
                className="h-40 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url('${practice.thumbnail_url}')` }}
              >
                <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 flex items-end p-4">
                  <Badge className="bg-gold/20 text-gold border-gold/30">
                    <Zap className="w-3 h-3 mr-1" />
                    Micro
                  </Badge>
                </div>
              </div>
              
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{practice.title}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {practice.creator}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {practice.story_hook}
                </p>
                
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">{practice.duration} min</span>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {practice.category}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {microPractices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No micro practices available yet.</p>
          </div>
        )}
      </div>

      <MainNavigation />
    </div>
  );
};

export default MicroPracticesLibrary;
